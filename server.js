require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const fetch   = require('node-fetch');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = 4000;

app.use(cors());
app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    next();
});
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const HEADERS = { 'User-Agent': 'WorldView/1.0 (github.com/worldview-app)' };
const TIMEOUT = 12000;

function parseEnvFile(filePath) {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    return text.split(/\r?\n/).reduce((acc, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return acc;
      const idx = trimmed.indexOf('=');
      if (idx === -1) return acc;
      const key = trimmed.slice(0, idx).trim();
      const raw = trimmed.slice(idx + 1).trim();
      const value = raw.replace(/^["'](.+)["']$/, '$1');
      acc[key] = value;
      return acc;
    }, {});
  } catch {
    return {};
  }
}

const envFile = path.join(__dirname, '.env');
const envFallback = parseEnvFile(envFile);
const WINDY_KEY = process.env.WINDY_WEBCAMS_KEY || envFallback.WINDY_WEBCAMS_KEY || '';

if (!WINDY_KEY) {
  console.warn('Windy API key missing (WINDY_WEBCAMS_KEY). /api/cameras/windy will return 503.');
}
const WINDY_BASE_URLS = [
  'https://api.windy.com/webcams/api/v3/webcams',
  'https://api.windy.com/api/webcams/v3/webcams',
];
const WINDY_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const windyCache = new Map();
const GPS_JAM_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let gpsJamCache = null;
let gpsJamCacheTime = 0;

function fetchWithTimeout(url, opts = {}) {
  return fetch(url, { ...opts, timeout: TIMEOUT });
}

function formatUtcDate(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function normalizeGpsJamPoint(raw) {
  const lat = Number(raw?.lat ?? raw?.latitude ?? raw?.y);
  const lon = Number(raw?.lon ?? raw?.lng ?? raw?.longitude ?? raw?.x);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const severity = Math.max(1, Math.min(3, Number(raw?.severity ?? raw?.level ?? 1) || 1));
  return {
    lat,
    lon,
    severity,
    region: String(raw?.region || raw?.name || raw?.label || 'GNSS Interference Area'),
    note: String(raw?.note || raw?.description || 'GNSS/GPS interference signal'),
    updatedAt: raw?.updatedAt || raw?.timestamp || null,
  };
}

function normalizeGpsJamPayload(payload) {
  if (!payload) return [];

  if (Array.isArray(payload)) {
    return payload.map(normalizeGpsJamPoint).filter(Boolean);
  }

  if (Array.isArray(payload.points)) {
    return payload.points.map(normalizeGpsJamPoint).filter(Boolean);
  }

  if (Array.isArray(payload.events)) {
    return payload.events.map(normalizeGpsJamPoint).filter(Boolean);
  }

  if (payload.type === 'FeatureCollection' && Array.isArray(payload.features)) {
    return payload.features.map((f) => {
      const coords = f?.geometry?.coordinates;
      const props = f?.properties || {};
      return normalizeGpsJamPoint({
        lat: Array.isArray(coords) ? coords[1] : null,
        lon: Array.isArray(coords) ? coords[0] : null,
        ...props,
      });
    }).filter(Boolean);
  }

  return [];
}

async function fetchGpsJamPoints() {
  const explicitUrl = process.env.GPS_JAM_URL || envFallback.GPS_JAM_URL || '';
  const templateUrl = process.env.GPS_JAM_URL_TEMPLATE || envFallback.GPS_JAM_URL_TEMPLATE || '';
  const types = ['jamming', 'spoofing', 'dashboard'];
  const urls = [];

  if (explicitUrl) urls.push(explicitUrl);

  if (templateUrl) {
    // Support templates such as:
    // https://rfi.stanford.edu/{YYYY-MM-DD}_{type}.json
    for (let i = 0; i <= 3; i++) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const day = formatUtcDate(date);
      for (const type of types) {
        urls.push(
          templateUrl
            .replace('{YYYY-MM-DD}', day)
            .replace('{type}', type)
        );
      }
    }
  }

  for (const url of urls) {
    try {
      const r = await fetchWithTimeout(url, { headers: HEADERS, timeout: 15000 });
      if (!r.ok) continue;
      const body = await r.json();
      const points = normalizeGpsJamPayload(body);
      if (points.length) {
        return { points: points.slice(0, 500), source: url };
      }
    } catch (_) {
      // try next source
    }
  }

  return { points: [], source: 'none' };
}

// ── Proxy: Military + LADD (govt/restricted) aircraft ────────────────────────
const FLIGHT_CACHE_TTL = 60 * 1000;
let flightsCache = null;
let flightsCacheTime = 0;

function openskyToAdsbLike(stateRow) {
  const hex = String(stateRow?.[0] || '').trim();
  const flight = String(stateRow?.[1] || '').trim();
  const origin = String(stateRow?.[2] || '').trim();
  const lon = Number(stateRow?.[5]);
  const lat = Number(stateRow?.[6]);
  const baroAltM = Number(stateRow?.[7]);
  const speedMs = Number(stateRow?.[9]);
  const heading = Number(stateRow?.[10]);
  if (!hex || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    hex,
    flight,
    lat,
    lon,
    alt_baro: Number.isFinite(baroAltM) ? baroAltM / 0.3048 : 0, // app expects feet
    gs: Number.isFinite(speedMs) ? speedMs * 1.94384 : null, // app expects knots
    track: Number.isFinite(heading) ? heading : 0,
    r: '',
    t: origin || 'GEN',
    origin_country: origin,
  };
}

function flightRegion(ac) {
  const lat = Number(ac.lat);
  const lon = Number(ac.lon);
  if (lat > 24 && lat < 50 && lon > -127 && lon < -66) return 'us';
  if (lat > 35 && lat < 72 && lon > -25 && lon < 45) return 'europe';
  if (lat > 5 && lat < 55 && lon > 45 && lon < 150) return 'asia';
  if (lat > -35 && lat < 37 && lon > -20 && lon < 60) return 'africa_me';
  if (lat > -60 && lat < 15 && lon > -90 && lon < -30) return 'southam';
  if (lat > -50 && lat < 5 && lon > 110 && lon < 180) return 'oceania';
  return 'other';
}

function stableHexHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function pickBalancedOpenSky(all) {
  const sorted = [...all].sort((a, b) => stableHexHash(a.hex) - stableHexHash(b.hex));
  const buckets = new Map();
  for (const ac of sorted) {
    const key = flightRegion(ac);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(ac);
  }

  const selection = [];
  const nonUSOrder = ['europe', 'asia', 'africa_me', 'southam', 'oceania', 'other'];
  const perRegion = 24;
  for (const region of nonUSOrder) {
    const items = buckets.get(region) || [];
    selection.push(...items.slice(0, perRegion));
  }
  const usItems = buckets.get('us') || [];
  selection.push(...usItems.slice(0, 20));
  return selection.slice(0, 180);
}

app.get('/api/flights', async (_req, res) => {
  const now = Date.now();
  if (flightsCache && now - flightsCacheTime < FLIGHT_CACHE_TTL) {
    return res.json({ ac: flightsCache });
  }

  try {
    const [milResult, laddResult, openskyResult] = await Promise.allSettled([
      fetchWithTimeout('https://api.adsb.lol/v2/mil',  { headers: HEADERS, timeout: 15000 }),
      fetchWithTimeout('https://api.adsb.lol/v2/ladd', { headers: HEADERS, timeout: 15000 }),
      fetchWithTimeout('https://opensky-network.org/api/states/all', { headers: HEADERS, timeout: 15000 }),
    ]);

    const combined = new Map();
    let milCount = 0;
    let laddCount = 0;
    let openskyAdded = 0;

    for (const [idx, result] of [milResult, laddResult].entries()) {
      if (result.status !== 'fulfilled' || !result.value.ok) continue;
      const data = await result.value.json();
      for (const p of (data.ac || [])) {
        if (p.lat != null && p.lon != null && !combined.has(p.hex)) {
          combined.set(p.hex, p);
          if (idx === 0) milCount++;
          else laddCount++;
        }
      }
    }

    if (openskyResult.status === 'fulfilled' && openskyResult.value.ok) {
      const data = await openskyResult.value.json();
      const mapped = Array.isArray(data?.states)
        ? data.states.map(openskyToAdsbLike).filter(Boolean)
        : [];
      const sampled = pickBalancedOpenSky(mapped);
      for (const p of sampled) {
        if (!combined.has(p.hex)) {
          combined.set(p.hex, p);
          openskyAdded++;
        }
      }
    }

    const ac = [...combined.values()];
    flightsCache = ac;
    flightsCacheTime = now;
    console.log(`Tracked aircraft: ${ac.length} (mil:${milCount} ladd:${laddCount} global:${openskyAdded})`);
    res.json({ ac });
  } catch (err) {
    console.error('Flight fetch error:', err.message);
    if (flightsCache) return res.json({ ac: flightsCache });
    res.status(500).json({ error: err.message });
  }
});

// ── Satellite TLE — persistent disk cache + multi-source fallback ─────────────
const SAT_CACHE_FILE = path.join(__dirname, 'tle-cache.json');
let satCache     = null;
let satCacheTime = 0;

// Pre-load from disk so restarts don't re-fetch
try {
  const raw    = fs.readFileSync(SAT_CACHE_FILE, 'utf8');
  satCache     = JSON.parse(raw);
  satCacheTime = Date.now() - 3_000_000; // treat as 50 min old → refresh within 10 min
  console.log(`Loaded ${satCache.length} satellites from disk cache`);
} catch (_) { /* no cache yet */ }

async function fetchSatellitesFromSources() {
  const TLE_SOURCES = [
    // JSON APIs (faster, smaller payloads)
    { type: 'ivan', url: 'https://tle.ivanstanojevic.me/api/tle/?page=1&page-size=100' },
    // Plain TLE text files
    { type: 'tle',  url: 'https://celestrak.org/pub/TLE/visual.txt' },
    { type: 'tle',  url: 'https://celestrak.com/pub/TLE/visual.txt' },
    { type: 'tle',  url: 'http://celestrak.org/pub/TLE/visual.txt' },
    { type: 'tle',  url: 'https://celestrak.org/pub/TLE/active.txt' },
    { type: 'tle',  url: 'https://celestrak.com/pub/TLE/active.txt' },
    { type: 'tle',  url: 'https://www.amsat.org/tle/current/nasabare.txt' },
  ];

  for (const src of TLE_SOURCES) {
    try {
      console.log(`Trying: ${src.url}`);
      const r = await fetch(src.url, { headers: HEADERS, timeout: 20000 });
      console.log(`  → ${r.status} ${r.statusText}`);
      if (!r.ok) continue;

      let sats = [];
      if (src.type === 'ivan') {
        const data = await r.json();
        sats = (data.member || [])
          .filter(m => m.line1 && m.line2)
          .map(m => ({ name: m.name, tle1: m.line1, tle2: m.line2 }));
      } else {
        sats = parseTLE(await r.text()).slice(0, 1000);
      }

      if (sats.length > 0) {
        console.log(`  ✓ Got ${sats.length} satellites from ${src.url}`);
        return sats;
      }
      console.warn(`  ✗ Parsed 0 satellites`);
    } catch (e) {
      console.error(`  ✗ ${e.message}`);
    }
  }
  return null;
}

app.get('/api/satellites', async (_req, res) => {
  const now = Date.now();
  if (satCache && now - satCacheTime < 3_600_000) {
    return res.json(satCache);
  }

  const sats = await fetchSatellitesFromSources();
  if (sats) {
    satCache     = sats;
    satCacheTime = now;
    fs.writeFile(SAT_CACHE_FILE, JSON.stringify(sats), err => {
      if (err) console.error('Failed to write TLE cache:', err.message);
      else console.log(`TLE cache saved to disk (${sats.length} sats)`);
    });
    return res.json(sats);
  }

  if (satCache) {
    console.warn('All sources failed — serving stale cache');
    return res.json(satCache);
  }
  res.status(500).json({ error: 'All satellite sources failed' });
});

// ── Satellite debug: test each source live ────────────────────────────────────
app.get('/api/satellites/debug', async (_req, res) => {
  const results = [];
  const urls = [
    'https://tle.ivanstanojevic.me/api/tle/?page=1&page-size=10',
    'https://celestrak.org/pub/TLE/visual.txt',
    'https://celestrak.com/pub/TLE/visual.txt',
    'http://celestrak.org/pub/TLE/visual.txt',
    'https://www.amsat.org/tle/current/nasabare.txt',
  ];
  for (const url of urls) {
    try {
      const r = await fetch(url, { headers: HEADERS, timeout: 10000 });
      results.push({ url, status: r.status, ok: r.ok });
    } catch (e) {
      results.push({ url, error: e.message });
    }
  }
  res.json({ cacheSize: satCache?.length ?? 0, sources: results });
});

function parseTLE(text) {
  const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean);
  const sats = [];
  for (let i = 0; i + 2 < lines.length; i += 3) {
    const name = lines[i];
    const tle1 = lines[i + 1];
    const tle2 = lines[i + 2];
    if (tle1.startsWith('1 ') && tle2.startsWith('2 ')) {
      sats.push({ name, tle1, tle2 });
    }
  }
  return sats;
}

// ── Proxy: ISS position ───────────────────────────────────────────────────────
app.get('/api/iss', async (_req, res) => {
  try {
    const response = await fetchWithTimeout('https://api.wheretheiss.at/v1/satellites/25544');
    if (!response.ok) throw new Error('ISS API error');
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('ISS fetch error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/gps-jamming', async (_req, res) => {
  const now = Date.now();
  if (gpsJamCache && now - gpsJamCacheTime < GPS_JAM_CACHE_TTL) {
    return res.json({ ...gpsJamCache, cached: true });
  }

  try {
    const result = await fetchGpsJamPoints();
    gpsJamCache = {
      points: result.points,
      source: result.source,
      asOf: new Date(now).toISOString(),
    };
    gpsJamCacheTime = now;
    res.json({ ...gpsJamCache, cached: false });
  } catch (err) {
    console.error('GPS jamming fetch error:', err.message);
    if (gpsJamCache) return res.json({ ...gpsJamCache, cached: true });
    const empty = {
      points: [],
      source: 'none',
      asOf: new Date(now).toISOString(),
      cached: true,
    };
    res.json(empty);
  }
});

// ── Proxy: Country borders GeoJSON (cached 24h) ───────────────────────────────
let countriesCache = null;
let countriesTime  = 0;

app.get('/api/countries', async (_req, res) => {
  const now = Date.now();
  if (countriesCache && now - countriesTime < 86_400_000) {
    return res.json(countriesCache);
  }
  try {
    const r = await fetchWithTimeout(
      'https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_110m_admin_0_countries.geojson',
      { headers: HEADERS, timeout: 20000 }
    );
    if (!r.ok) throw new Error(`Countries GeoJSON ${r.status}`);
    countriesCache = await r.json();
    countriesTime  = now;
    console.log('Countries GeoJSON cached.');
    res.json(countriesCache);
  } catch (err) {
    console.error('Countries error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

let usStatesCache = null;
let usStatesTime = 0;

app.get('/api/us-states', async (_req, res) => {
  const now = Date.now();
  if (usStatesCache && now - usStatesTime < 86_400_000) {
    return res.json(usStatesCache);
  }

  const urls = [
    'https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json',
    'https://eric.clst.org/assets/wiki/uploads/Stuff/gz_2010_us_040_00_500k.json',
  ];

  for (const url of urls) {
    try {
      const r = await fetchWithTimeout(url, { headers: HEADERS, timeout: 20000 });
      if (!r.ok) continue;
      const data = await r.json();
      if (!data || !Array.isArray(data.features)) continue;
      usStatesCache = data;
      usStatesTime = now;
      console.log(`US states GeoJSON cached from ${url}.`);
      return res.json(usStatesCache);
    } catch (err) {
      console.error(`US states source failed (${url}):`, err.message);
    }
  }

  if (usStatesCache) return res.json(usStatesCache);
  res.status(500).json({ error: 'US states GeoJSON unavailable' });
});

// ── Proxy: Singapore LTA Traffic Cameras (cached 5min) ───────────────────────
let sgCache = null;
let sgTime  = 0;

app.get('/api/cameras/singapore', async (_req, res) => {
  const now = Date.now();
  if (sgCache && now - sgTime < 300_000) return res.json(sgCache);

  // Try new API endpoint first, fall back to old one
  const SG_URLS = [
    'https://api.data.gov.sg/v1/transport/traffic-images',
    'https://datamall2.mytransport.sg/ltaodataservice/Traffic-Imagesv2',
  ];

  for (const url of SG_URLS) {
    try {
      const r = await fetch(url, { headers: HEADERS, timeout: 10000 });
      console.log(`Singapore LTA ${url} → ${r.status}`);
      if (!r.ok) continue;
      const data = await r.json();
      // Handle both response formats
      const rawCams = data.items?.[0]?.cameras || data.value || [];
      if (!rawCams.length) continue;
      const cameras = rawCams.map(c => ({
        name:     `CAM ${c.camera_id || c.CameraID}`,
        lat:      c.location?.latitude  ?? c.Latitude,
        lon:      c.location?.longitude ?? c.Longitude,
        imageUrl: c.image ?? c.ImageLink,
      })).filter(c => c.lat && c.lon && c.imageUrl);
      if (!cameras.length) continue;
      sgCache = cameras;
      sgTime  = now;
      console.log(`Singapore cameras cached: ${cameras.length} from ${url}`);
      return res.json(cameras);
    } catch (e) {
      console.error(`Singapore ${url}: ${e.message}`);
    }
  }

  if (sgCache) return res.json(sgCache);
  res.status(500).json({ error: 'Singapore camera API unavailable' });
});

// ── Static camera positions for all cities ────────────────────────────────────
const STATIC_CAMERAS = {
  // Americas
  nyc: [
    { name: 'Times Square',            lat: 40.7580, lon: -73.9855 },
    { name: 'Brooklyn Bridge',         lat: 40.7061, lon: -73.9969 },
    { name: 'Central Park South',      lat: 40.7644, lon: -73.9735 },
    { name: 'Grand Central Terminal',  lat: 40.7527, lon: -73.9772 },
    { name: 'World Trade Center',      lat: 40.7127, lon: -74.0134 },
    { name: 'Holland Tunnel',          lat: 40.7272, lon: -74.0096 },
    { name: 'Manhattan Bridge',        lat: 40.7075, lon: -73.9903 },
    { name: 'FDR Drive & 42nd St',     lat: 40.7531, lon: -73.9638 },
  ],
  la: [
    { name: 'Hollywood & Highland',    lat: 34.1017, lon: -118.3394 },
    { name: 'Santa Monica Pier',       lat: 34.0084, lon: -118.4982 },
    { name: 'I-405 & Wilshire',        lat: 34.0536, lon: -118.4565 },
    { name: 'Downtown — 5th & Grand',  lat: 34.0494, lon: -118.2566 },
    { name: 'LAX Airport Approach',    lat: 33.9444, lon: -118.4094 },
    { name: 'I-405 & I-10 Interchange',lat: 34.0318, lon: -118.4481 },
    { name: 'Sunset & Vine',           lat: 34.0979, lon: -118.3267 },
  ],
  chicago: [
    { name: 'Millennium Park',         lat: 41.8826, lon: -87.6226 },
    { name: 'Willis Tower',            lat: 41.8789, lon: -87.6359 },
    { name: 'Navy Pier',               lat: 41.8919, lon: -87.6051 },
    { name: 'Michigan Ave & Chicago',  lat: 41.8967, lon: -87.6241 },
    { name: 'Wacker & Lake St',        lat: 41.8863, lon: -87.6326 },
    { name: 'O\'Hare Airport I-190',   lat: 41.9779, lon: -87.8675 },
    { name: 'I-90/94 & Congress',      lat: 41.8756, lon: -87.6334 },
  ],
  miami: [
    { name: 'South Beach — Ocean Dr',  lat: 25.7826, lon: -80.1300 },
    { name: 'Downtown Brickell',       lat: 25.7617, lon: -80.1918 },
    { name: 'Port of Miami',           lat: 25.7743, lon: -80.1742 },
    { name: 'Miami Beach Causeway',    lat: 25.7907, lon: -80.1636 },
    { name: 'Wynwood Arts District',   lat: 25.8008, lon: -80.1989 },
    { name: 'I-95 & NW 36th St',       lat: 25.8111, lon: -80.2085 },
  ],
  dc: [
    { name: 'White House',             lat: 38.8977, lon: -77.0365 },
    { name: 'US Capitol',              lat: 38.8899, lon: -77.0091 },
    { name: 'National Mall',           lat: 38.8893, lon: -77.0353 },
    { name: 'Lincoln Memorial',        lat: 38.8893, lon: -77.0502 },
    { name: 'Dupont Circle',           lat: 38.9096, lon: -77.0437 },
    { name: 'Georgetown — M St NW',    lat: 38.9076, lon: -77.0723 },
    { name: 'Pentagon',                lat: 38.8719, lon: -77.0563 },
    { name: 'Reagan Airport',          lat: 38.8521, lon: -77.0402 },
  ],
  toronto: [
    { name: 'CN Tower',                lat: 43.6426, lon: -79.3871 },
    { name: 'Yonge & Dundas',          lat: 43.6561, lon: -79.3802 },
    { name: 'Gardiner Expressway',     lat: 43.6367, lon: -79.3945 },
    { name: 'Highway 401 & 400',       lat: 43.7484, lon: -79.5441 },
    { name: 'Distillery District',     lat: 43.6503, lon: -79.3596 },
  ],
  vancouver: [
    { name: 'Downtown — Granville St', lat: 49.2827, lon: -123.1207 },
    { name: 'Stanley Park',            lat: 49.3023, lon: -123.1452 },
    { name: 'Gastown',                 lat: 49.2838, lon: -123.1078 },
    { name: 'Lions Gate Bridge',       lat: 49.3130, lon: -123.1399 },
    { name: 'Vancouver Airport',       lat: 49.1967, lon: -123.1815 },
  ],
  mexico: [
    { name: 'Zócalo',                  lat: 19.4326, lon: -99.1332 },
    { name: 'Paseo de la Reforma',     lat: 19.4274, lon: -99.1677 },
    { name: 'Angel of Independence',   lat: 19.4269, lon: -99.1674 },
    { name: 'Chapultepec Park',        lat: 19.4200, lon: -99.1897 },
    { name: 'Insurgentes & Baja Cal.', lat: 19.4000, lon: -99.1731 },
    { name: 'NAICM Airport',           lat: 19.3607, lon: -99.0006 },
  ],
  saopaulo: [
    { name: 'Paulista Avenue',         lat: -23.5630, lon: -46.6543 },
    { name: 'Ibirapuera Park',         lat: -23.5874, lon: -46.6576 },
    { name: 'Downtown — Praça Sé',     lat: -23.5505, lon: -46.6333 },
    { name: 'Marginal Tietê',          lat: -23.5209, lon: -46.6267 },
    { name: 'Guarulhos Airport',       lat: -23.4356, lon: -46.4731 },
  ],
  buenosaires: [
    { name: 'Plaza de Mayo',           lat: -34.6083, lon: -58.3712 },
    { name: 'Obelisk — 9 de Julio',    lat: -34.6037, lon: -58.3816 },
    { name: 'La Boca — Caminito',      lat: -34.6345, lon: -58.3631 },
    { name: 'Palermo — Santa Fe',      lat: -34.5908, lon: -58.4098 },
    { name: 'Ezeiza Airport',          lat: -34.8222, lon: -58.5358 },
  ],
  bogota: [
    { name: 'Plaza Bolívar',           lat:  4.5981,  lon: -74.0760 },
    { name: 'Carrera 7 & 26',          lat:  4.6097,  lon: -74.0817 },
    { name: 'Zona Rosa',               lat:  4.6667,  lon: -74.0526 },
    { name: 'El Dorado Airport',       lat:  4.7016,  lon: -74.1469 },
  ],
  lima: [
    { name: 'Plaza Mayor',             lat: -12.0464, lon: -77.0285 },
    { name: 'Miraflores Malecón',      lat: -12.1219, lon: -77.0301 },
    { name: 'Javier Prado Ave',        lat: -12.0875, lon: -77.0508 },
    { name: 'Jorge Chávez Airport',    lat: -12.0219, lon: -77.1143 },
  ],
  santiago: [
    { name: 'Plaza de Armas',          lat: -33.4372, lon: -70.6506 },
    { name: 'Costanera Center',        lat: -33.4172, lon: -70.6064 },
    { name: 'Alameda Ave',             lat: -33.4489, lon: -70.6693 },
    { name: 'Arturo Merino Airport',   lat: -33.3930, lon: -70.7954 },
  ],
  // Europe
  paris: [
    { name: 'Eiffel Tower',            lat: 48.8584, lon:  2.2945 },
    { name: 'Champs-Élysées & Arc',    lat: 48.8738, lon:  2.2950 },
    { name: 'Notre-Dame',              lat: 48.8530, lon:  2.3499 },
    { name: 'Louvre Museum',           lat: 48.8606, lon:  2.3376 },
    { name: 'Place de la Bastille',    lat: 48.8533, lon:  2.3692 },
    { name: 'Gare du Nord',            lat: 48.8809, lon:  2.3553 },
    { name: 'Montmartre — Sacré-Cœur', lat: 48.8867, lon:  2.3431 },
  ],
  berlin: [
    { name: 'Brandenburg Gate',        lat: 52.5163, lon: 13.3777 },
    { name: 'Potsdamer Platz',         lat: 52.5096, lon: 13.3760 },
    { name: 'Alexanderplatz',          lat: 52.5219, lon: 13.4132 },
    { name: 'Checkpoint Charlie',      lat: 52.5075, lon: 13.3904 },
    { name: 'Kurfürstendamm',          lat: 52.5027, lon: 13.3317 },
    { name: 'Tegel Airport',           lat: 52.5597, lon: 13.2877 },
  ],
  madrid: [
    { name: 'Puerta del Sol',          lat: 40.4168, lon: -3.7038 },
    { name: 'Plaza Mayor',             lat: 40.4154, lon: -3.7074 },
    { name: 'Gran Vía',                lat: 40.4200, lon: -3.7025 },
    { name: 'Paseo del Prado',         lat: 40.4137, lon: -3.6923 },
    { name: 'Barajas Airport T4',      lat: 40.4947, lon: -3.5769 },
  ],
  rome: [
    { name: 'Colosseum',               lat: 41.8902, lon: 12.4922 },
    { name: 'Trevi Fountain',          lat: 41.9009, lon: 12.4833 },
    { name: 'Vatican St Peter\'s',     lat: 41.9022, lon: 12.4534 },
    { name: 'Piazza Navona',           lat: 41.8992, lon: 12.4730 },
    { name: 'Via del Corso',           lat: 41.9031, lon: 12.4797 },
    { name: 'Fiumicino Airport',       lat: 41.8003, lon: 12.2389 },
  ],
  amsterdam: [
    { name: 'Dam Square',              lat: 52.3731, lon:  4.8926 },
    { name: 'Anne Frank House',        lat: 52.3752, lon:  4.8840 },
    { name: 'Rijksmuseum',             lat: 52.3600, lon:  4.8852 },
    { name: 'Leidseplein',             lat: 52.3625, lon:  4.8820 },
    { name: 'Schiphol Airport',        lat: 52.3105, lon:  4.7683 },
  ],
  brussels: [
    { name: 'Grand Place',             lat: 50.8467, lon:  4.3525 },
    { name: 'Atomium',                 lat: 50.8947, lon:  4.3414 },
    { name: 'EU Quarter',              lat: 50.8466, lon:  4.3776 },
    { name: 'Brussels South Station',  lat: 50.8354, lon:  4.3362 },
    { name: 'Brussels Airport',        lat: 50.9014, lon:  4.4844 },
  ],
  vienna: [
    { name: 'Stephansdom',             lat: 48.2085, lon: 16.3731 },
    { name: 'Ringstrasse',             lat: 48.2036, lon: 16.3660 },
    { name: 'Prater — Riesenrad',      lat: 48.2167, lon: 16.3967 },
    { name: 'Schönbrunn Palace',       lat: 48.1845, lon: 16.3120 },
    { name: 'Vienna Airport',          lat: 48.1103, lon: 16.5697 },
  ],
  warsaw: [
    { name: 'Old Town Market',         lat: 52.2494, lon: 21.0126 },
    { name: 'Palace of Culture',       lat: 52.2318, lon: 21.0062 },
    { name: 'Warsaw Central Station',  lat: 52.2278, lon: 21.0031 },
    { name: 'Nowy Świat',              lat: 52.2355, lon: 21.0162 },
    { name: 'Warsaw Chopin Airport',   lat: 52.1657, lon: 20.9671 },
  ],
  kyiv: [
    { name: 'Maidan Nezalezhnosti',    lat: 50.4501, lon: 30.5234 },
    { name: 'Khreshchatyk Street',     lat: 50.4470, lon: 30.5233 },
    { name: 'Sophia Cathedral',        lat: 50.4526, lon: 30.5141 },
    { name: 'Pechersk Lavra',          lat: 50.4347, lon: 30.5572 },
    { name: 'Boryspil Airport',        lat: 50.3450, lon: 30.8947 },
  ],
  moscow: [
    { name: 'Red Square',              lat: 55.7539, lon: 37.6208 },
    { name: 'Kremlin',                 lat: 55.7520, lon: 37.6175 },
    { name: 'Arbat Street',            lat: 55.7500, lon: 37.5929 },
    { name: 'Moscow City',             lat: 55.7498, lon: 37.5404 },
    { name: 'Sheremetyevo Airport',    lat: 55.9726, lon: 37.4146 },
  ],
  stockholm: [
    { name: 'Gamla Stan',              lat: 59.3233, lon: 18.0707 },
    { name: 'Sergels Torg',            lat: 59.3326, lon: 18.0632 },
    { name: 'Djurgården',              lat: 59.3250, lon: 18.1088 },
    { name: 'Kungsträdgården',         lat: 59.3319, lon: 18.0712 },
    { name: 'Arlanda Airport',         lat: 59.6519, lon: 17.9186 },
  ],
  lisbon: [
    { name: 'Praça do Comércio',       lat: 38.7080, lon: -9.1367 },
    { name: 'Alfama District',         lat: 38.7136, lon: -9.1313 },
    { name: 'Belém Tower',             lat: 38.6916, lon: -9.2160 },
    { name: 'Marquês de Pombal',       lat: 38.7259, lon: -9.1493 },
    { name: 'Humberto Delgado Airport',lat: 38.7742, lon: -9.1342 },
  ],
  athens: [
    { name: 'Acropolis',               lat: 37.9715, lon: 23.7257 },
    { name: 'Syntagma Square',         lat: 37.9756, lon: 23.7349 },
    { name: 'Monastiraki',             lat: 37.9753, lon: 23.7244 },
    { name: 'Omonia Square',           lat: 37.9839, lon: 23.7278 },
    { name: 'Athens Airport',          lat: 37.9364, lon: 23.9445 },
  ],
  istanbul: [
    { name: 'Hagia Sophia',            lat: 41.0086, lon: 28.9802 },
    { name: 'Grand Bazaar',            lat: 41.0108, lon: 28.9681 },
    { name: 'Taksim Square',           lat: 41.0369, lon: 28.9850 },
    { name: 'Bosphorus Bridge',        lat: 41.0455, lon: 29.0337 },
    { name: 'Atatürk Airport',         lat: 40.9769, lon: 28.8146 },
  ],
  // Middle East
  dubai: [
    { name: 'Burj Khalifa',            lat: 25.1972, lon: 55.2744 },
    { name: 'Dubai Mall',              lat: 25.1980, lon: 55.2796 },
    { name: 'Palm Jumeirah',           lat: 25.1124, lon: 55.1390 },
    { name: 'Dubai Marina',            lat: 25.0818, lon: 55.1389 },
    { name: 'Sheikh Zayed Road',       lat: 25.2037, lon: 55.2562 },
    { name: 'Dubai Airport T3',        lat: 25.2532, lon: 55.3657 },
    { name: 'Jumeirah Beach',          lat: 25.2009, lon: 55.2370 },
  ],
  abudhabi: [
    { name: 'Sheikh Zayed Mosque',     lat: 24.4128, lon: 54.4751 },
    { name: 'Corniche',                lat: 24.4635, lon: 54.3440 },
    { name: 'Yas Island Circuit',      lat: 24.4672, lon: 54.6031 },
    { name: 'Abu Dhabi Corniche',      lat: 24.4672, lon: 54.3604 },
    { name: 'Abu Dhabi Airport',       lat: 24.4330, lon: 54.6511 },
  ],
  riyadh: [
    { name: 'Kingdom Centre Tower',    lat: 24.7114, lon: 46.6742 },
    { name: 'Diriyah',                 lat: 24.7341, lon: 46.5753 },
    { name: 'Tahlia Street',           lat: 24.6898, lon: 46.6720 },
    { name: 'Olaya District',          lat: 24.6999, lon: 46.6830 },
    { name: 'KFIA Airport',            lat: 24.9575, lon: 46.6988 },
  ],
  baghdad: [
    { name: 'Green Zone',              lat: 33.3152, lon: 44.3661 },
    { name: 'Tahrir Square',           lat: 33.3406, lon: 44.4009 },
    { name: 'Al-Rasheed Street',       lat: 33.3387, lon: 44.4020 },
    { name: 'Baghdad Airport',         lat: 33.2625, lon: 44.2346 },
    { name: 'Tigris Bridges',          lat: 33.3500, lon: 44.3800 },
  ],
  tehran: [
    { name: 'Azadi Tower',             lat: 35.6998, lon: 51.3379 },
    { name: 'Vanak Square',            lat: 35.7574, lon: 51.4103 },
    { name: 'Milad Tower',             lat: 35.7448, lon: 51.3745 },
    { name: 'Grand Bazaar',            lat: 35.6737, lon: 51.4204 },
    { name: 'IKA Airport',             lat: 35.4161, lon: 51.1522 },
  ],
  doha: [
    { name: 'Souq Waqif',              lat: 25.2867, lon: 51.5333 },
    { name: 'Pearl Qatar',             lat: 25.3704, lon: 51.5504 },
    { name: 'Corniche',                lat: 25.2897, lon: 51.5319 },
    { name: 'Lusail Stadium',          lat: 25.4355, lon: 51.4894 },
    { name: 'Hamad Airport',           lat: 25.2609, lon: 51.6138 },
  ],
  kuwait: [
    { name: 'Kuwait Towers',           lat: 29.3813, lon: 47.9842 },
    { name: 'Grand Mosque',            lat: 29.3733, lon: 47.9858 },
    { name: 'Marina Mall',             lat: 29.3572, lon: 47.9860 },
    { name: 'Kuwait City Airport',     lat: 29.2267, lon: 47.9689 },
  ],
  muscat: [
    { name: 'Sultan Qaboos Mosque',    lat: 23.5892, lon: 58.4030 },
    { name: 'Old Muscat Corniche',     lat: 23.6141, lon: 58.5921 },
    { name: 'Mutrah Souq',             lat: 23.6191, lon: 58.5902 },
    { name: 'Muscat Airport',          lat: 23.5933, lon: 58.2844 },
  ],
  beirut: [
    { name: 'Martyrs\' Square',        lat: 33.8942, lon: 35.5030 },
    { name: 'Hamra Street',            lat: 33.8957, lon: 35.4793 },
    { name: 'Corniche Beirut',         lat: 33.8937, lon: 35.4837 },
    { name: 'Port of Beirut',          lat: 33.9003, lon: 35.5196 },
    { name: 'Beirut Airport',          lat: 33.8209, lon: 35.4884 },
  ],
  amman: [
    { name: 'Downtown — Rainbow St',   lat: 31.9521, lon: 35.9308 },
    { name: 'Amman Citadel',           lat: 31.9551, lon: 35.9314 },
    { name: 'Fourth Circle',           lat: 31.9713, lon: 35.8990 },
    { name: 'Queen Alia Airport',      lat: 31.7226, lon: 35.9932 },
  ],
  telaviv: [
    { name: 'Dizengoff Square',        lat: 32.0782, lon: 34.7748 },
    { name: 'Jaffa Clock Tower',       lat: 32.0519, lon: 34.7516 },
    { name: 'Rothschild Boulevard',    lat: 32.0631, lon: 34.7706 },
    { name: 'Ayalon Highway',          lat: 32.0840, lon: 34.7990 },
    { name: 'Ben Gurion Airport',      lat: 32.0114, lon: 34.8867 },
  ],
  // Africa
  cairo: [
    { name: 'Tahrir Square',           lat: 30.0444, lon: 31.2357 },
    { name: 'Pyramids of Giza',        lat: 29.9792, lon: 31.1342 },
    { name: 'Cairo Tower',             lat: 30.0459, lon: 31.2243 },
    { name: 'Khan El-Khalili',         lat: 30.0478, lon: 31.2627 },
    { name: 'Cairo International',     lat: 30.1219, lon: 31.4056 },
  ],
  lagos: [
    { name: 'Victoria Island',         lat:  6.4314, lon:  3.4229 },
    { name: 'Eko Bridge',              lat:  6.4552, lon:  3.3840 },
    { name: 'Balogun Market',          lat:  6.4530, lon:  3.3967 },
    { name: 'Murtala Mohammed Airport',lat:  6.5775, lon:  3.3212 },
  ],
  nairobi: [
    { name: 'KICC',                    lat: -1.2864, lon: 36.8233 },
    { name: 'Kenyatta Avenue',         lat: -1.2831, lon: 36.8219 },
    { name: 'Uhuru Park',              lat: -1.2914, lon: 36.8127 },
    { name: 'Westlands',               lat: -1.2642, lon: 36.8047 },
    { name: 'JKIA Airport',            lat: -1.3192, lon: 36.9275 },
  ],
  joburg: [
    { name: 'Sandton City',            lat: -26.1072, lon: 28.0567 },
    { name: 'Nelson Mandela Square',   lat: -26.1077, lon: 28.0563 },
    { name: 'Constitution Hill',       lat: -26.1950, lon: 28.0422 },
    { name: 'OR Tambo Airport',        lat: -26.1392, lon: 28.2460 },
  ],
  addis: [
    { name: 'Meskel Square',           lat:  9.0074, lon: 38.7635 },
    { name: 'Bole Road',               lat:  9.0047, lon: 38.7814 },
    { name: 'Piazza District',         lat:  9.0369, lon: 38.7527 },
    { name: 'Bole International',      lat:  8.9779, lon: 38.7992 },
  ],
  casablanca: [
    { name: 'Hassan II Mosque',        lat: 33.6084, lon: -7.6325 },
    { name: 'Place Mohammed V',        lat: 33.5903, lon: -7.6196 },
    { name: 'Boulevard de la Corniche',lat: 33.5950, lon: -7.6680 },
    { name: 'Mohammed V Airport',      lat: 33.3675, lon: -7.5899 },
  ],
  khartoum: [
    { name: 'Nile Confluence',         lat: 15.5965, lon: 32.5541 },
    { name: 'Martyrs Square',          lat: 15.5988, lon: 32.5311 },
    { name: 'Khartoum Airport',        lat: 15.5895, lon: 32.5532 },
    { name: 'Omdurman Bridge',         lat: 15.6403, lon: 32.5137 },
  ],
  kinshasa: [
    { name: 'Gombe District',          lat: -4.3022, lon: 15.2978 },
    { name: 'Boulevard du 30-Juin',    lat: -4.3217, lon: 15.3224 },
    { name: 'Ndjili Airport',          lat: -4.3854, lon: 15.4447 },
    { name: 'Congo River Waterfront',  lat: -4.3167, lon: 15.2914 },
  ],
  // Asia-Pacific
  tokyo: [
    { name: 'Shibuya Crossing',        lat: 35.6595, lon: 139.7004 },
    { name: 'Shinjuku Station',        lat: 35.6896, lon: 139.6917 },
    { name: 'Tokyo Tower',             lat: 35.6586, lon: 139.7454 },
    { name: 'Ginza 4-chome',           lat: 35.6717, lon: 139.7649 },
    { name: 'Asakusa Temple',          lat: 35.7148, lon: 139.7967 },
    { name: 'Haneda Airport',          lat: 35.5494, lon: 139.7798 },
  ],
  beijing: [
    { name: 'Tiananmen Square',        lat: 39.9042, lon: 116.4074 },
    { name: 'Forbidden City',          lat: 39.9163, lon: 116.3972 },
    { name: 'Wangfujing',              lat: 39.9148, lon: 116.4126 },
    { name: 'National Stadium (Bird)', lat: 39.9929, lon: 116.3963 },
    { name: 'Beijing Capital Airport', lat: 40.0801, lon: 116.5846 },
  ],
  shanghai: [
    { name: 'The Bund',                lat: 31.2399, lon: 121.4900 },
    { name: 'People\'s Square',        lat: 31.2304, lon: 121.4737 },
    { name: 'Oriental Pearl Tower',    lat: 31.2397, lon: 121.4997 },
    { name: 'Nanjing Road',            lat: 31.2376, lon: 121.4774 },
    { name: 'Pudong Airport',          lat: 31.1434, lon: 121.8052 },
  ],
  seoul: [
    { name: 'Gangnam Station',         lat: 37.4979, lon: 127.0276 },
    { name: 'Myeongdong',              lat: 37.5637, lon: 126.9851 },
    { name: 'Gyeongbokgung Palace',    lat: 37.5796, lon: 126.9770 },
    { name: 'Han River Bridge',        lat: 37.5495, lon: 126.9469 },
    { name: 'Incheon Airport',         lat: 37.4602, lon: 126.4407 },
  ],
  hongkong: [
    { name: 'Victoria Harbour',        lat: 22.2965, lon: 114.1722 },
    { name: 'Central District',        lat: 22.2800, lon: 114.1588 },
    { name: 'Nathan Road — Tsim Sha',  lat: 22.3027, lon: 114.1714 },
    { name: 'The Peak',                lat: 22.2759, lon: 114.1455 },
    { name: 'HKIA Airport',            lat: 22.3080, lon: 113.9185 },
  ],
  bangkok: [
    { name: 'Grand Palace',            lat: 13.7500, lon: 100.4913 },
    { name: 'Khao San Road',           lat: 13.7589, lon: 100.4977 },
    { name: 'Sukhumvit Road',          lat: 13.7311, lon: 100.5630 },
    { name: 'Suvarnabhumi Airport',    lat: 13.6900, lon: 100.7501 },
    { name: 'Chatuchak Market',        lat: 13.7999, lon: 100.5501 },
  ],
  jakarta: [
    { name: 'National Monument',       lat: -6.1751, lon: 106.8272 },
    { name: 'Jalan Sudirman',          lat: -6.2177, lon: 106.8228 },
    { name: 'Kota Tua',                lat: -6.1352, lon: 106.8133 },
    { name: 'Soekarno-Hatta Airport',  lat: -6.1256, lon: 106.6559 },
  ],
  kl: [
    { name: 'Petronas Twin Towers',    lat:  3.1578, lon: 101.7123 },
    { name: 'Bukit Bintang',           lat:  3.1482, lon: 101.7105 },
    { name: 'Central Market',          lat:  3.1433, lon: 101.6945 },
    { name: 'KLIA Airport',            lat:  2.7456, lon: 101.7099 },
  ],
  manila: [
    { name: 'Rizal Park',              lat: 14.5826, lon: 120.9787 },
    { name: 'EDSA — Makati Ave',       lat: 14.5568, lon: 121.0132 },
    { name: 'Intramuros',              lat: 14.5896, lon: 120.9750 },
    { name: 'Ninoy Aquino Airport',    lat: 14.5086, lon: 121.0194 },
  ],
  hcmc: [
    { name: 'Ben Thanh Market',        lat: 10.7726, lon: 106.6980 },
    { name: 'Bui Vien Street',         lat: 10.7663, lon: 106.6939 },
    { name: 'Dong Khoi Street',        lat: 10.7769, lon: 106.7030 },
    { name: 'Tan Son Nhat Airport',    lat: 10.8188, lon: 106.6520 },
  ],
  sydney: [
    { name: 'Sydney Opera House',      lat: -33.8568, lon: 151.2153 },
    { name: 'Harbour Bridge',          lat: -33.8523, lon: 151.2108 },
    { name: 'Bondi Beach',             lat: -33.8908, lon: 151.2743 },
    { name: 'Central Station',         lat: -33.8831, lon: 151.2063 },
    { name: 'Circular Quay',           lat: -33.8617, lon: 151.2107 },
    { name: 'Sydney Airport',          lat: -33.9461, lon: 151.1772 },
  ],
  melbourne: [
    { name: 'Flinders St Station',     lat: -37.8183, lon: 144.9671 },
    { name: 'Federation Square',       lat: -37.8180, lon: 144.9690 },
    { name: 'St Kilda Beach',          lat: -37.8672, lon: 144.9763 },
    { name: 'CBD — Collins St',        lat: -37.8136, lon: 144.9631 },
    { name: 'Melbourne Airport',       lat: -37.6690, lon: 144.8410 },
  ],
  // South Asia
  delhi: [
    { name: 'India Gate',              lat: 28.6129, lon: 77.2295 },
    { name: 'Connaught Place',         lat: 28.6315, lon: 77.2167 },
    { name: 'Red Fort',                lat: 28.6562, lon: 77.2410 },
    { name: 'IGI Airport T3',          lat: 28.5562, lon: 77.1000 },
    { name: 'NH-48 Mahipalpur',        lat: 28.5459, lon: 77.1278 },
  ],
  mumbai: [
    { name: 'Gateway of India',        lat: 18.9220, lon: 72.8347 },
    { name: 'Marine Drive',            lat: 18.9440, lon: 72.8237 },
    { name: 'Bandra-Worli Sea Link',   lat: 19.0237, lon: 72.8175 },
    { name: 'Chhatrapati Shivaji T.',  lat: 18.9398, lon: 72.8355 },
    { name: 'Mumbai Airport T2',       lat: 19.0896, lon: 72.8656 },
  ],
  karachi: [
    { name: 'Clifton Beach',           lat: 24.8161, lon: 67.0294 },
    { name: 'M.A. Jinnah Road',        lat: 24.8607, lon: 67.0011 },
    { name: 'Mazar-e-Quaid',           lat: 24.8746, lon: 67.0330 },
    { name: 'Jinnah Airport',          lat: 24.9065, lon: 67.1608 },
  ],
  dhaka: [
    { name: 'Shahbag Square',          lat: 23.7384, lon: 90.3950 },
    { name: 'Motijheel',               lat: 23.7249, lon: 90.4174 },
    { name: 'National Parliament',     lat: 23.7619, lon: 90.3759 },
    { name: 'Hazrat Shahjalal Airport',lat: 23.8433, lon: 90.3978 },
  ],
  colombo: [
    { name: 'Galle Face Green',        lat:  6.9109, lon: 79.8479 },
    { name: 'Colombo Fort',            lat:  6.9344, lon: 79.8428 },
    { name: 'Pettah Market',           lat:  6.9355, lon: 79.8516 },
    { name: 'Bandaranaike Airport',    lat:  7.1804, lon: 79.8841 },
  ],
};

app.get('/api/cameras/static/:city', (req, res) => {
  const cams = STATIC_CAMERAS[req.params.city];
  if (!cams) return res.json([]);
  res.json(cams);
});

function windyCacheKey(lat, lon, radiusKm) {
  return `${lat.toFixed(4)}:${lon.toFixed(4)}:${Math.round(radiusKm)}`;
}

function normalizeWindyWebcam(cam) {
  const lat = Number(cam?.location?.latitude);
  const lon = Number(cam?.location?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const preview =
    cam?.images?.current?.preview ||
    cam?.images?.daylight?.preview ||
    cam?.image?.current?.preview ||
    cam?.image?.day?.preview;
  if (!preview) return null;
  const streamUrl = cam?.player?.day?.hd || cam?.player?.day?.sd || cam?.player?.hd || cam?.player?.sd || null;
  return {
    name: cam.title || cam?.title || 'Webcam',
    lat,
    lon,
    imageUrl: preview,
    streamUrl,
  };
}

async function fetchWindyCameras(lat, lon, radiusKm = 30) {
  if (!WINDY_KEY) return null;
  const cacheKey = windyCacheKey(lat, lon, radiusKm);
  const cached = windyCache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.ts < WINDY_CACHE_TTL) {
    return cached.data;
  }
  const coordString = `${lat.toFixed(4)},${lon.toFixed(4)},${Math.round(radiusKm)}`;
  const v3Params = new URLSearchParams({
    nearby: coordString,
    include: 'location,images,player',
    limit: '24',
  });
  const endpoints = WINDY_BASE_URLS.map(base => `${base}?${v3Params.toString()}`);
  const attempts = [];

  for (const url of endpoints) {
    const response = await fetchWithTimeout(url, {
      headers: { ...HEADERS, 'x-windy-api-key': WINDY_KEY },
      timeout: 20000,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '<no body>');
      attempts.push({ status: response.status, body, url });
      console.error('Windy API error body:', body);
      continue;
    }

    const data = await response.json();
    const cams = Array.isArray(data?.webcams)
      ? data.webcams
      : Array.isArray(data?.result?.webcams)
        ? data.result.webcams
        : Array.isArray(data)
          ? data
          : [];
    const normalized = cams.map(normalizeWindyWebcam).filter(Boolean).slice(0, 24);
    windyCache.set(cacheKey, { ts: now, data: normalized });
    return normalized;
  }

  const lastAttempt = attempts[attempts.length - 1] || null;
  const err = new Error(`Windy ${lastAttempt?.status || 502}`);
  err.status = lastAttempt?.status || 502;
  err.details = lastAttempt?.body || 'Windy request failed';
  err.endpoint = lastAttempt?.url || null;
  err.attempts = attempts;
  throw err;
}

app.get('/api/cameras/windy', async (req, res) => {
  if (!WINDY_KEY) return res.status(503).json({ error: 'Windy CCTV key not configured' });
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  const radius = parseFloat(req.query.radius) || 30;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({ error: 'lat and lon query params required' });
  }
  try {
    const requestedRadius = Math.max(5, Math.min(200, radius));
    const candidateRadii = [
      requestedRadius,
      Math.max(80, requestedRadius * 2),
      Math.max(120, requestedRadius * 3),
    ].map(r => Math.round(Math.min(200, r)));
    const radii = [...new Set(candidateRadii)];

    let cameras = [];
    for (const searchRadius of radii) {
      cameras = await fetchWindyCameras(lat, lon, searchRadius);
      if (Array.isArray(cameras) && cameras.length) {
        return res.json(cameras);
      }
    }

    res.json([]);
  } catch (err) {
    console.error('Windy cameras error:', err.message);
    res.status(err.status || 502).json({
      error: err.message,
      details: err.details || null,
      endpoint: err.endpoint || null,
      attempts: err.attempts || [],
    });
  }
});

// ── Proxy: London TfL JamCam list (cached 1h) ────────────────────────────────
let tflCache = null;
let tflTime  = 0;

app.get('/api/cameras/london', async (_req, res) => {
  const now = Date.now();
  if (tflCache && now - tflTime < 3_600_000) return res.json(tflCache);
  try {
    const r = await fetchWithTimeout('https://api.tfl.gov.uk/Place/Type/JamCam', { headers: HEADERS });
    if (!r.ok) throw new Error(`TfL API ${r.status}`);
    const data = await r.json();
    const cams = data
      .filter(c =>
        c.lat > 51.45 && c.lat < 51.56 &&
        c.lon > -0.22 && c.lon < 0.05
      )
      .map(c => ({
        name:     c.commonName,
        lat:      c.lat,
        lon:      c.lon,
        imageUrl: c.additionalProperties?.find(p => p.key === 'imageUrl')?.value,
      }))
      .filter(c => c.imageUrl)
      .slice(0, 9);
    tflCache = cams;
    tflTime  = now;
    console.log(`London cameras cached: ${cams.length}`);
    res.json(cams);
  } catch (err) {
    console.error('TfL error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Proxy: Camera image (avoids CORS for cross-origin JPEG feeds) ─────────────
const ALLOWED_CAM_HOSTS = [
  's3-eu-west-1.amazonaws.com',
  'jamcams.tfl.gov.uk',
  'images.data.gov.sg',
  'api.data.gov.sg',
];

app.get('/api/cam-proxy', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send('Missing url');
  let hostname;
  try { hostname = new URL(url).hostname; } catch { return res.status(400).send('Bad url'); }
  if (!ALLOWED_CAM_HOSTS.some(h => hostname.endsWith(h))) {
    return res.status(403).send('Host not allowed');
  }
  try {
    const r = await fetchWithTimeout(url, { headers: HEADERS });
    if (!r.ok) return res.status(r.status).send('Upstream error');
    res.set('Content-Type', r.headers.get('content-type') || 'image/jpeg');
    r.body.pipe(res);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// ── Geopolitical Events — GDELT news API ─────────────────────────────────────
let geoCache     = null;
let geoCacheTime = 0;
const GEO_CACHE_TTL = 5 * 60 * 1000;
const GEO_HISTORY_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const GEO_RESOLVED_AFTER_MS = 2 * 60 * 60 * 1000;
const geoHistory = new Map();

// Location lookup: scan article titles for these names → map to lat/lon
const LOCATION_MAP = [
  { names: ['ukraine','ukrainian','kyiv','kharkiv','zaporizhzhia','odesa','kherson','donbas','mariupol'], lat: 49.0, lon: 31.0, label: 'Ukraine' },
  { names: ['gaza','hamas','rafah','west bank','palestine','palestinian'], lat: 31.5, lon: 34.5, label: 'Gaza/Palestine' },
  { names: ['israel','israeli','netanyahu','idf','tel aviv'], lat: 31.8, lon: 35.0, label: 'Israel' },
  { names: ['russia','russian','moscow','kremlin','putin'], lat: 55.75, lon: 37.6, label: 'Russia' },
  { names: ['iran','iranian','tehran','irgc','revolutionary guard'], lat: 32.0, lon: 53.0, label: 'Iran' },
  { names: ['north korea','pyongyang','dprk','kim jong'], lat: 39.0, lon: 125.8, label: 'North Korea' },
  { names: ['taiwan strait'], lat: 24.0, lon: 119.5, label: 'Taiwan Strait' },
  { names: ['taiwan','taiwanese','taipei'], lat: 23.7, lon: 121.0, label: 'Taiwan' },
  { names: ['china','chinese','beijing','pla','xi jinping'], lat: 39.9, lon: 116.4, label: 'China' },
  { names: ['red sea','bab el-mandeb','suez'], lat: 14.5, lon: 41.0, label: 'Red Sea' },
  { names: ['yemen','yemeni','houthi','sanaa','aden'], lat: 15.5, lon: 48.0, label: 'Yemen' },
  { names: ['sudan','sudanese','khartoum','rsf','rapid support forces'], lat: 15.5, lon: 32.5, label: 'Sudan' },
  { names: ['syria','syrian','damascus','aleppo'], lat: 34.8, lon: 38.9, label: 'Syria' },
  { names: ['myanmar','burma','burmese','naypyidaw'], lat: 19.0, lon: 96.5, label: 'Myanmar' },
  { names: ['somalia','somali','mogadishu','al-shabaab','al shabaab'], lat: 5.5, lon: 46.0, label: 'Somalia' },
  { names: ['ethiopia','ethiopian','tigray','addis ababa'], lat: 9.0, lon: 40.0, label: 'Ethiopia' },
  { names: ['mali','malian','bamako'], lat: 17.0, lon: -4.0, label: 'Mali' },
  { names: ['niger','nigerien','niamey'], lat: 17.0, lon: 8.0, label: 'Niger' },
  { names: ['burkina faso','ouagadougou'], lat: 12.5, lon: -1.5, label: 'Burkina Faso' },
  { names: ['congo','drc','kinshasa','democratic republic of congo'], lat: -4.3, lon: 15.3, label: 'DR Congo' },
  { names: ['libya','libyan','tripoli'], lat: 27.0, lon: 17.0, label: 'Libya' },
  { names: ['lebanon','lebanese','beirut','hezbollah'], lat: 33.9, lon: 35.5, label: 'Lebanon' },
  { names: ['iraq','iraqi','baghdad','mosul','erbil'], lat: 33.3, lon: 44.4, label: 'Iraq' },
  { names: ['afghanistan','afghan','kabul','taliban'], lat: 33.0, lon: 65.0, label: 'Afghanistan' },
  { names: ['pakistan','pakistani','islamabad'], lat: 30.0, lon: 70.0, label: 'Pakistan' },
  { names: ['south china sea','spratly','paracel'], lat: 12.0, lon: 114.0, label: 'South China Sea' },
  { names: ['haiti','haitian','port-au-prince'], lat: 19.0, lon: -72.5, label: 'Haiti' },
  { names: ['venezuela','venezuelan','caracas','maduro'], lat: 7.5, lon: -66.5, label: 'Venezuela' },
  { names: ['serbia','serbian','belgrade','kosovo'], lat: 44.0, lon: 21.0, label: 'Serbia/Kosovo' },
  { names: ['nagorno-karabakh','azerbaijan','armenia','yerevan','baku'], lat: 40.0, lon: 47.0, label: 'Caucasus' },
  { names: ['turkey','turkish','ankara','erdogan'], lat: 39.0, lon: 35.0, label: 'Turkey' },
  { names: ['philippines','philippine','manila','marcos'], lat: 13.0, lon: 122.0, label: 'Philippines' },
  { names: ['kashmir','india-pakistan'], lat: 34.0, lon: 74.0, label: 'Kashmir' },
  { names: ['india','indian','new delhi','modi'], lat: 20.0, lon: 77.0, label: 'India' },
  { names: ['saudi','riyadh'], lat: 24.7, lon: 46.7, label: 'Saudi Arabia' },
  { names: ['nato'], lat: 50.9, lon: 4.3, label: 'NATO' },
  { names: ['pentagon','us military','u.s. military','american forces'], lat: 38.9, lon: -77.0, label: 'United States' },
];

const HIGH_WORDS = ['killed','kills','dead','deaths','death toll','attack','attacked','bombing','bombed','airstrike','airstrikes','missile','missiles','invasion','invades','combat','offensive','casualties','explosion','strike','siege','massacre','murdered'];
const MED_WORDS  = ['military','conflict','tension','nuclear','threat','threatens','sanctions','weapons','escalat','warning','hostil','ceasefire','war','troops','forces','fighting','captured','detain','unrest','crisis','shelling','artillery','drone'];

function scoreTitle(title) {
  const t = title.toLowerCase();
  if (HIGH_WORDS.some(w => t.includes(w))) return 3;
  if (MED_WORDS.some(w => t.includes(w)))  return 2;
  return 1;
}

function extractLocation(title) {
  const t = title.toLowerCase();
  for (const loc of LOCATION_MAP) {
    if (loc.names.some(n => t.includes(n))) return loc;
  }
  return null;
}

const EVENT_TYPE_RULES = [
  { type: 'Airstrike/Bombing', words: ['airstrike', 'air strike', 'bombing', 'bombed'] },
  { type: 'Missile/Drone Strike', words: ['missile', 'drone'] },
  { type: 'Ground Combat', words: ['offensive', 'troops', 'forces', 'captured', 'siege', 'fighting', 'combat'] },
  { type: 'Naval/Shipping Security', words: ['red sea', 'shipping', 'maritime', 'strait', 'navy'] },
  { type: 'Civil Unrest/Protest', words: ['protest', 'riot', 'unrest'] },
  { type: 'Diplomatic/Sanctions', words: ['sanction', 'ceasefire', 'talks', 'summit', 'diplomat', 'negotiation'] },
  { type: 'Terror/Insurgency', words: ['isis', 'terror', 'militant', 'houthi', 'hamas', 'hezbollah', 'taliban'] },
];

const ACTOR_HINTS = [
  ['russia', 'Russia'],
  ['ukraine', 'Ukraine'],
  ['israel', 'Israel'],
  ['palestine', 'Palestinian groups'],
  ['hamas', 'Hamas'],
  ['iran', 'Iran'],
  ['houthi', 'Houthis'],
  ['china', 'China'],
  ['taiwan', 'Taiwan'],
  ['north korea', 'North Korea'],
  ['south korea', 'South Korea'],
  ['india', 'India'],
  ['pakistan', 'Pakistan'],
  ['nato', 'NATO'],
  ['u.s.', 'United States'],
  ['us military', 'United States'],
];

function classifyEventType(title = '') {
  const t = title.toLowerCase();
  for (const rule of EVENT_TYPE_RULES) {
    if (rule.words.some(w => t.includes(w))) return rule.type;
  }
  return 'Military/Geopolitical Tension';
}

function inferActors(title = '', location = '') {
  const t = title.toLowerCase();
  const actors = new Set();
  for (const [word, label] of ACTOR_HINTS) {
    if (t.includes(word)) actors.add(label);
  }
  if (!actors.size && location) actors.add(location);
  return [...actors].slice(0, 3);
}

function parseGdeltSeenDate(seendate) {
  if (!seendate) return null;
  const s = String(seendate);
  if (/^\d{8}T\d{6}Z$/.test(s)) {
    const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z`;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function scoreConfidence({
  title,
  severity,
  url,
  domain,
  seendate,
  sourceQuality = 0.55,
  sourceCount = 1,
  fallback = false,
}) {
  if (fallback) return { score: 34, label: 'LOW' };
  let score = 28 + (severity || 1) * 12;
  if (url) score += 8;
  if (domain) score += 7;
  score += Math.round(Math.max(0, Math.min(1, sourceQuality)) * 18);
  score += Math.min(16, (Math.max(1, sourceCount) - 1) * 5);
  const seenAt = parseGdeltSeenDate(seendate);
  if (seenAt) {
    const ageHours = Math.max(0, (Date.now() - seenAt.getTime()) / 3_600_000);
    if (ageHours <= 6) score += 8;
    else if (ageHours <= 24) score += 5;
    else if (ageHours <= 72) score += 2;
  }
  if ((title || '').length >= 70) score += 3;
  score = Math.max(25, Math.min(92, Math.round(score)));
  return {
    score,
    label: score >= 75 ? 'HIGH' : score >= 55 ? 'MEDIUM' : 'LOW',
  };
}

function buildEventSummary({ title, location, eventType, actors, severity }) {
  const sevLabel = severity === 3 ? 'critical' : severity === 2 ? 'high' : 'moderate';
  const actorText = actors && actors.length ? actors.join(', ') : location;
  const lead = `${eventType} with ${sevLabel} impact indicators around ${location}.`;
  return `${lead} Actors mentioned: ${actorText}. Headline: ${title}`;
}

function normalizeGeoEvent(ev, opts = {}) {
  const fallback = Boolean(opts.fallback);
  const eventType = ev.eventType || classifyEventType(ev.title || '');
  const actors = Array.isArray(ev.actors) && ev.actors.length
    ? ev.actors
    : inferActors(ev.title || '', ev.location || '');
  const confidence = ev.confidence || scoreConfidence({ ...ev, fallback });
  const sourceLinks = Array.isArray(ev.sourceLinks)
    ? ev.sourceLinks
    : ev.url
      ? [{ url: ev.url, domain: ev.domain || null }]
      : [];
  return {
    ...ev,
    ingestedAt: ev.ingestedAt || new Date().toISOString(),
    eventType,
    actors,
    confidence,
    sourceLinks,
    summary: ev.summary || buildEventSummary({
      title: ev.title || 'Untitled event',
      location: ev.location || 'Unknown location',
      eventType,
      actors,
      severity: ev.severity || 1,
    }),
    sourceCount: ev.sourceCount || sourceLinks.length,
    sourceTier: ev.sourceTier || (fallback ? 'fallback' : 'open-source'),
  };
}

const GEO_SOURCES = {
  gdelt: { id: 'gdelt', name: 'GDELT', quality: 0.58 },
  bbc: { id: 'bbc', name: 'BBC RSS', quality: 0.85 },
  googlenews: { id: 'googlenews', name: 'Google News RSS', quality: 0.65 },
};

function decodeXmlEntities(text = '') {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(text = '') {
  return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeTitleForDedupe(title = '') {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(title = '') {
  const stop = new Set(['the', 'a', 'an', 'in', 'on', 'for', 'to', 'of', 'and', 'with', 'at', 'from', 'is', 'are']);
  return new Set(
    normalizeTitleForDedupe(title)
      .split(' ')
      .filter(w => w.length > 2 && !stop.has(w))
  );
}

function titleSimilarity(a = '', b = '') {
  const ta = tokenSet(a);
  const tb = tokenSet(b);
  if (!ta.size || !tb.size) return 0;
  let overlap = 0;
  for (const tok of ta) if (tb.has(tok)) overlap++;
  return overlap / Math.max(ta.size, tb.size);
}

function extractTag(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  if (!m) return '';
  return decodeXmlEntities(stripHtml(m[1]));
}

async function fetchRssArticles(url, sourceMeta, limit = 60) {
  const r = await fetchWithTimeout(url, { headers: HEADERS, timeout: 15000 });
  if (!r.ok) throw new Error(`${sourceMeta.name} ${r.status}`);
  const xml = await r.text();
  const items = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)];
  const out = [];
  for (const match of items.slice(0, limit)) {
    const block = match[0];
    const title = extractTag(block, 'title');
    if (!title) continue;
    const link = extractTag(block, 'link');
    const pubDate = extractTag(block, 'pubDate');
    let domain = null;
    try { domain = link ? new URL(link).hostname.replace(/^www\./, '') : null; } catch { domain = null; }
    out.push({
      title,
      url: link || null,
      domain,
      seendate: pubDate || null,
      sourceId: sourceMeta.id,
      sourceName: sourceMeta.name,
      sourceQuality: sourceMeta.quality,
    });
  }
  return out;
}

async function fetchGdeltArticles() {
  const q = encodeURIComponent('war attack military killed airstrike missile troops invasion conflict');
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${q}&mode=artlist&maxrecords=80&format=json&timespan=12h&sourcelang=English`;
  const r = await fetchWithTimeout(url, { headers: HEADERS, timeout: 22000 });
  if (!r.ok) throw new Error(`GDELT ${r.status}`);
  const data = await r.json();
  const articles = Array.isArray(data.articles) ? data.articles : [];
  return articles.map(art => ({
    title: art.title || '',
    url: art.url || null,
    domain: art.domain || null,
    seendate: art.seendate || null,
    sourceId: GEO_SOURCES.gdelt.id,
    sourceName: GEO_SOURCES.gdelt.name,
    sourceQuality: GEO_SOURCES.gdelt.quality,
  })).filter(a => a.title);
}

async function fetchAllGeoArticles() {
  const results = await Promise.allSettled([
    fetchGdeltArticles(),
    fetchRssArticles('https://feeds.bbci.co.uk/news/world/rss.xml', GEO_SOURCES.bbc),
    fetchRssArticles('https://news.google.com/rss/search?q=war+attack+missile+ceasefire+conflict&hl=en-US&gl=US&ceid=US:en', GEO_SOURCES.googlenews),
  ]);
  const merged = [];
  for (const result of results) {
    if (result.status === 'fulfilled') merged.push(...result.value);
    else console.warn('Geo source fetch failed:', result.reason?.message || result.reason);
  }
  return merged;
}

function clusterGeoEvents(candidates) {
  const clusters = [];
  for (const cand of candidates) {
    const match = clusters.find(cluster =>
      cluster.location === cand.location && titleSimilarity(cluster.title, cand.title) >= 0.55
    );
    if (!match) {
      clusters.push({
        ...cand,
        sources: [{
          id: cand.sourceId,
          name: cand.sourceName,
          quality: cand.sourceQuality,
          url: cand.url,
          domain: cand.domain,
          seendate: cand.seendate,
        }],
      });
      continue;
    }

    if (cand.severity > match.severity) match.severity = cand.severity;
    if ((cand.title || '').length > (match.title || '').length) match.title = cand.title;
    const existingSource = match.sources.find(s => s.url && cand.url && s.url === cand.url);
    if (!existingSource) {
      match.sources.push({
        id: cand.sourceId,
        name: cand.sourceName,
        quality: cand.sourceQuality,
        url: cand.url,
        domain: cand.domain,
        seendate: cand.seendate,
      });
    }
    const currentDate = parseGdeltSeenDate(match.seendate);
    const candidateDate = parseGdeltSeenDate(cand.seendate);
    if (!currentDate || (candidateDate && candidateDate > currentDate)) {
      match.seendate = cand.seendate;
    }
  }
  return clusters;
}

function historyEventKey(ev) {
  const titleKey = normalizeTitleForDedupe(ev.title || '').split(' ').slice(0, 8).join(' ');
  return `${ev.location || 'unknown'}|${ev.eventType || 'unknown'}|${titleKey}`;
}

function updateGeoHistory(currentEvents, nowMs) {
  const activeKeys = new Set();

  for (const ev of currentEvents) {
    const key = historyEventKey(ev);
    activeKeys.add(key);
    const prev = geoHistory.get(key);
    const nowIso = new Date(nowMs).toISOString();
    const severityChanged = prev ? prev.severity !== ev.severity : false;
    const titleChanged = prev ? prev.title !== ev.title : false;
    const confidenceChanged = prev ? (prev.confidence?.score || 0) !== (ev.confidence?.score || 0) : false;
    const sourceCountChanged = prev ? (prev.sourceCount || 0) !== (ev.sourceCount || 0) : false;
    const changed = severityChanged || titleChanged || confidenceChanged || sourceCountChanged;

    if (!prev) {
      geoHistory.set(key, {
        ...ev,
        historyKey: key,
        state: 'new',
        firstSeen: nowIso,
        lastSeen: nowIso,
        lastStateChange: nowIso,
      });
      continue;
    }

    let nextState = 'active';
    let lastStateChange = prev.lastStateChange || prev.lastSeen || nowIso;
    const firstSeenMs = new Date(prev.firstSeen || nowIso).getTime();
    if (changed) {
      nextState = 'updated';
      lastStateChange = nowIso;
    } else if (nowMs - firstSeenMs < 6 * 60 * 60 * 1000) {
      nextState = 'new';
    } else if (prev.state === 'resolved') {
      nextState = 'updated';
      lastStateChange = nowIso;
    }

    geoHistory.set(key, {
      ...prev,
      ...ev,
      historyKey: key,
      state: nextState,
      firstSeen: prev.firstSeen || nowIso,
      lastSeen: nowIso,
      lastStateChange,
    });
  }

  for (const [key, record] of geoHistory.entries()) {
    if (activeKeys.has(key)) continue;
    const lastSeenMs = new Date(record.lastSeen || 0).getTime();
    if (!lastSeenMs) continue;
    if (nowMs - lastSeenMs >= GEO_RESOLVED_AFTER_MS && record.state !== 'resolved') {
      geoHistory.set(key, {
        ...record,
        state: 'resolved',
        lastStateChange: new Date(nowMs).toISOString(),
      });
    }
  }

  for (const [key, record] of geoHistory.entries()) {
    const lastSeenMs = new Date(record.lastSeen || 0).getTime();
    if (!lastSeenMs || nowMs - lastSeenMs > GEO_HISTORY_TTL_MS) {
      geoHistory.delete(key);
    }
  }
}

function filterGeoHistory(params, nowMs) {
  const timeline = String(params.timeline || '168').toLowerCase();
  const status = String(params.status || 'all').toLowerCase();
  const type = String(params.type || 'all').toLowerCase();
  const severityMin = Math.max(1, Math.min(3, parseInt(params.severity || '1', 10) || 1));
  const isOngoing = timeline === 'ongoing';

  const windowHours = isOngoing
    ? null
    : (timeline.endsWith('h') ? parseInt(timeline, 10) : parseInt(timeline, 10) || 168);
  const cutoffMs = isOngoing ? null : (nowMs - Math.max(1, windowHours) * 3_600_000);

  const rows = [...geoHistory.values()].filter(rec => {
    if (isOngoing) {
      const recState = String(rec.state || '').toLowerCase();
      if (recState === 'resolved') return false;
    } else {
      // Strict recency for 24h/7d/30d tabs: prefer source publication time.
      // If missing, fall back to ingestion time so feeds without pubDate still appear.
      const sourceSeenMs = parseGdeltSeenDate(rec.seendate)?.getTime() || 0;
      const ingestSeenMs = new Date(rec.ingestedAt || rec.lastSeen || 0).getTime() || 0;
      const effectiveSeenMs = sourceSeenMs || ingestSeenMs;
      if (!effectiveSeenMs || effectiveSeenMs < cutoffMs) return false;
    }
    if ((rec.severity || 1) < severityMin) return false;
    if (type !== 'all' && String(rec.eventType || '').toLowerCase() !== type) return false;
    if (status !== 'all' && String(rec.state || '').toLowerCase() !== status) return false;
    return true;
  });

  rows.sort((a, b) => {
    const rank = { new: 4, updated: 3, active: 2, resolved: 1 };
    const stateDelta = (rank[b.state] || 0) - (rank[a.state] || 0);
    if (stateDelta !== 0) return stateDelta;
    const confDelta = (b.confidence?.score || 0) - (a.confidence?.score || 0);
    if (confDelta !== 0) return confDelta;
    return new Date(b.lastSeen || 0).getTime() - new Date(a.lastSeen || 0).getTime();
  });

  const types = [...new Set(rows.map(r => r.eventType).filter(Boolean))].sort();
  return { rows: rows.slice(0, 50), types, windowHours };
}

const FALLBACK_EVENTS = [
  { title: 'Ongoing Russia-Ukraine conflict', location: 'Ukraine', lat: 49.0, lon: 31.0, severity: 3, url: null },
  { title: 'Gaza conflict and humanitarian situation', location: 'Gaza/Palestine', lat: 31.5, lon: 34.5, severity: 3, url: null },
  { title: 'Houthi attacks on Red Sea shipping', location: 'Yemen', lat: 15.5, lon: 48.0, severity: 3, url: null },
  { title: 'Taiwan Strait military tensions', location: 'Taiwan Strait', lat: 24.0, lon: 119.5, severity: 2, url: null },
  { title: 'North Korea ballistic missile program', location: 'North Korea', lat: 39.0, lon: 125.8, severity: 2, url: null },
  { title: 'Sudan civil war — RSF conflict', location: 'Sudan', lat: 15.5, lon: 32.5, severity: 3, url: null },
  { title: 'Iran nuclear program tensions', location: 'Iran', lat: 32.0, lon: 53.0, severity: 2, url: null },
  { title: 'South China Sea territorial disputes', location: 'South China Sea', lat: 12.0, lon: 114.0, severity: 2, url: null },
  { title: 'Myanmar civil war — military junta', location: 'Myanmar', lat: 19.0, lon: 96.5, severity: 3, url: null },
  { title: 'Sahel instability — Mali/Burkina Faso', location: 'Mali', lat: 17.0, lon: -4.0, severity: 2, url: null },
].map(ev => normalizeGeoEvent(ev, { fallback: true }));

app.get('/api/geopolitical', async (_req, res) => {
  const now = Date.now();
  if (geoCache && now - geoCacheTime < GEO_CACHE_TTL) {
    const filtered = filterGeoHistory(_req.query, now);
    return res.json({
      events: filtered.rows,
      availableTypes: filtered.types,
      timelineHours: filtered.windowHours,
      cached: true,
    });
  }

  try {
    const articles = await fetchAllGeoArticles();
    const candidates = [];
    for (const art of articles) {
      if (!art.title) continue;
      const loc = extractLocation(art.title);
      if (!loc) continue;
      candidates.push({
        title: art.title,
        location: loc.label,
        lat: loc.lat,
        lon: loc.lon,
        severity: scoreTitle(art.title),
        url: art.url || null,
        domain: art.domain || null,
        seendate: art.seendate || null,
        sourceId: art.sourceId,
        sourceName: art.sourceName,
        sourceQuality: art.sourceQuality,
      });
    }

    const clusters = clusterGeoEvents(candidates);
    const events = clusters.map(cluster => {
      const sourceCount = cluster.sources.length;
      const avgSourceQuality = cluster.sources.length
        ? cluster.sources.reduce((sum, s) => sum + (s.quality || 0.5), 0) / cluster.sources.length
        : 0.5;
      const primary = cluster.sources[0] || {};
      return normalizeGeoEvent({
        title: cluster.title,
        location: cluster.location,
        lat: cluster.lat,
        lon: cluster.lon,
        severity: cluster.severity,
        url: primary.url || null,
        domain: primary.domain || null,
        seendate: cluster.seendate || primary.seendate || null,
        sourceLinks: cluster.sources
          .filter(s => s.url)
          .slice(0, 3)
          .map(s => ({ url: s.url, domain: s.domain || s.name })),
        sourceCount,
        sourceQuality: avgSourceQuality,
        summary: `Corroborated by ${sourceCount} source${sourceCount === 1 ? '' : 's'}. ${cluster.title}`,
      });
    });

    events.sort((a, b) => (b.confidence?.score || 0) - (a.confidence?.score || 0));
    const top10 = events.slice(0, 20);

    // Pad with fallback entries if fewer than 5 real results
    if (top10.length < 5) {
      for (const fb of FALLBACK_EVENTS) {
        if (top10.length >= 10) break;
        if (!top10.some(e => e.location === fb.location)) top10.push(fb);
      }
    }

    geoCache = top10;
    geoCacheTime = now;
    updateGeoHistory(top10, now);
    const filtered = filterGeoHistory(_req.query, now);
    console.log(`Geopolitical events: ${filtered.rows.length} shown (${events.length} clustered from ${candidates.length} raw articles)`);
    res.json({
      events: filtered.rows,
      availableTypes: filtered.types,
      timelineHours: filtered.windowHours,
      cached: false,
    });
  } catch (err) {
    console.error('Geopolitical error:', err.message);
    if (geoCache) {
      const filtered = filterGeoHistory(_req.query, now);
      return res.json({
        events: filtered.rows,
        availableTypes: filtered.types,
        timelineHours: filtered.windowHours,
        cached: true,
      });
    }
    updateGeoHistory(FALLBACK_EVENTS, now);
    const filtered = filterGeoHistory(_req.query, now);
    const wantsOngoing = String(_req.query?.timeline || '').toLowerCase() === 'ongoing';
    res.json({
      events: filtered.rows.length ? filtered.rows : (wantsOngoing ? FALLBACK_EVENTS : []),
      availableTypes: filtered.types,
      timelineHours: filtered.windowHours,
      cached: true,
    });
  }
});

app.listen(PORT, () => {
  console.log(`\n🌍 WorldView server running at http://localhost:${PORT}\n`);
});
