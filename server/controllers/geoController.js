import { createLogger } from '../utils/logger.js';

const logger = createLogger('geo');

function createGeoControllers(deps) {
  const { fetchWithTimeout, HEADERS, GPS_JAM_CACHE_TTL, envFallback, envValue } = deps;
  let gpsJamCache = null;
  let gpsJamCacheTime = 0;
  const ISS_API_URL_DEFAULTS = [
    'https://api.wheretheiss.at/v1/satellites/25544',
    'http://api.open-notify.org/iss-now.json',
  ];
  const GPS_JAM_URL_TEMPLATE_DEFAULTS = [
    'https://rfi.stanford.edu/{YYYY-MM-DD}_{type}.json',
  ];
  const ISS_API_URLS = (envValue('ISS_API_URLS', envFallback) || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  const issApiUrls = ISS_API_URLS.length
    ? ISS_API_URLS
    : [envValue('ISS_API_URL', envFallback), ...ISS_API_URL_DEFAULTS].filter(Boolean);
  const GPS_JAM_FALLBACK_POINTS = [
    { lat: 49.3, lon: 31.2, severity: 3, region: 'Ukraine', note: 'GNSS interference hotspot (fallback demo data)' },
    { lat: 31.6, lon: 34.6, severity: 3, region: 'Gaza/Israel', note: 'GNSS interference hotspot (fallback demo data)' },
    { lat: 15.4, lon: 47.9, severity: 2, region: 'Red Sea / Yemen', note: 'GNSS interference hotspot (fallback demo data)' },
    { lat: 24.2, lon: 119.6, severity: 2, region: 'Taiwan Strait', note: 'GNSS interference hotspot (fallback demo data)' },
    { lat: 39.9, lon: 45.1, severity: 2, region: 'South Caucasus', note: 'GNSS interference hotspot (fallback demo data)' },
  ];
  const GPS_JAM_ADSB_URLS = [
    'https://api.adsb.lol/v2/ladd',
    'https://api.adsb.lol/v2/mil',
  ];
  
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

  function parseAdsbAircraft(payload) {
    if (!payload) return [];
    if (Array.isArray(payload.ac)) return payload.ac;
    if (Array.isArray(payload.aircraft)) return payload.aircraft;
    if (Array.isArray(payload.states)) return payload.states;
    return [];
  }

  function aircraftGpsIsDegraded(ac) {
    const nacp = Number(ac?.nac_p ?? ac?.nacp ?? ac?.nacP);
    const nic = Number(ac?.nic);
    const gpsOkBefore = ac?.gpsOkBefore;
    if (Number.isFinite(nacp) && nacp > 0 && nacp <= 5) return true;
    if (Number.isFinite(nic) && nic > 0 && nic <= 4) return true;
    if (gpsOkBefore) return true;
    return false;
  }

  function adsbToHotspots(aircraft) {
    const buckets = new Map();
    for (const ac of aircraft) {
      const lat = Number(ac?.lat);
      const lon = Number(ac?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const bLat = Math.round(lat * 2) / 2;
      const bLon = Math.round(lon * 2) / 2;
      const key = `${bLat}:${bLon}`;
      if (!buckets.has(key)) {
        buckets.set(key, { lat: bLat, lon: bLon, total: 0, bad: 0 });
      }
      const bucket = buckets.get(key);
      bucket.total += 1;
      if (aircraftGpsIsDegraded(ac)) bucket.bad += 1;
    }

    const points = [];
    for (const bucket of buckets.values()) {
      if (bucket.total < 8) continue;
      const ratio = bucket.bad / bucket.total;
      if (ratio < 0.12) continue;
      const severity = ratio >= 0.35 ? 3 : ratio >= 0.2 ? 2 : 1;
      points.push({
        lat: bucket.lat,
        lon: bucket.lon,
        severity,
        region: 'ADS-B GNSS anomaly cluster',
        note: `Derived from live ADS-B quality flags (bad ${Math.round(ratio * 100)}% of ${bucket.total} aircraft)`,
      });
    }
    return points.slice(0, 500);
  }

  async function fetchGpsJamFromAdsb() {
    const merged = [];
    for (const url of GPS_JAM_ADSB_URLS) {
      try {
        const r = await fetchWithTimeout(url, { headers: HEADERS, timeout: 12000 });
        if (!r.ok) continue;
        const data = await r.json();
        merged.push(...parseAdsbAircraft(data));
      } catch (_) {
        // try next source
      }
    }
    if (!merged.length) return null;
    const points = adsbToHotspots(merged);
    // Even if zero hotspots are detected, this is still a live read.
    // Returning empty data prevents misleading demo fallback overlays.
    return { points, source: 'adsb-derived-live' };
  }
  
  async function fetchGpsJamPoints() {
    const explicitUrl = envValue('GPS_JAM_URL', envFallback);
    const templateValues = [
      ...((envValue('GPS_JAM_URL_TEMPLATES', envFallback) || '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)),
      envValue('GPS_JAM_URL_TEMPLATE', envFallback),
      ...GPS_JAM_URL_TEMPLATE_DEFAULTS,
    ].filter(Boolean);
    const types = ['jamming', 'spoofing', 'dashboard'];
    const urls = [];

    const adsbResult = await fetchGpsJamFromAdsb();
    if (adsbResult?.points?.length) return adsbResult;
  
    if (explicitUrl) urls.push(explicitUrl);
  
    for (const templateUrl of templateValues) {
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
  
    return { points: GPS_JAM_FALLBACK_POINTS, source: 'fallback' };
  }

  function normalizeIssPayload(data) {
    // whereTheISS
    if (Number.isFinite(Number(data?.latitude)) && Number.isFinite(Number(data?.longitude))) {
      return data;
    }
    // open-notify
    if (data?.iss_position?.latitude && data?.iss_position?.longitude) {
      const latitude = Number(data.iss_position.latitude);
      const longitude = Number(data.iss_position.longitude);
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        return {
          latitude,
          longitude,
          timestamp: Number(data.timestamp) || Math.floor(Date.now() / 1000),
          source: 'open-notify',
        };
      }
    }
    return null;
  }

  async function fetchIssLive() {
    for (const url of issApiUrls) {
      try {
        const response = await fetchWithTimeout(url, { headers: HEADERS, timeout: 10000 });
        if (!response.ok) continue;
        const data = await response.json();
        const normalized = normalizeIssPayload(data);
        if (normalized) return normalized;
      } catch (_) {
        // try next endpoint
      }
    }
    throw new Error('ISS API error');
  }

  const iss = async (_req, res) => {
    try {
      const data = await fetchIssLive();
      res.json(data);
    } catch (err) {
      logger.error('ISS fetch error:', err.message);
      res.status(500).json({ error: err.message });
    }
  };

  const gpsJamming = async (_req, res) => {
    const now = Date.now();
  
    try {
      const result = await fetchGpsJamPoints();
      if (result.source !== 'fallback') {
        gpsJamCache = {
          points: result.points,
          source: result.source,
          asOf: new Date(now).toISOString(),
        };
        gpsJamCacheTime = now;
        return res.json({ ...gpsJamCache, cached: false });
      }

      if (gpsJamCache && now - gpsJamCacheTime < GPS_JAM_CACHE_TTL) {
        return res.json({ ...gpsJamCache, cached: true });
      }

      const fallback = {
        points: result.points,
        source: result.source,
        asOf: new Date(now).toISOString(),
      };
      return res.json({ ...fallback, cached: true });
    } catch (err) {
      logger.error('GPS jamming fetch error:', err.message);
      if (gpsJamCache) return res.json({ ...gpsJamCache, cached: true });
      const empty = {
        points: [],
        source: 'none',
        asOf: new Date(now).toISOString(),
        cached: true,
      };
      res.json(empty);
    }
  };

  let countriesCache = null;
  let countriesTime  = 0;
  const countriesUrls = [
    'https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_110m_admin_0_countries.geojson',
    'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson',
  ];
  
  const countries = async (_req, res) => {
    const now = Date.now();
    if (countriesCache && now - countriesTime < 86_400_000) {
      return res.json(countriesCache);
    }
    for (const url of countriesUrls) {
      try {
        const r = await fetchWithTimeout(url, { headers: HEADERS, timeout: 20000 });
        if (!r.ok) continue;
        const data = await r.json();
        if (!data || !Array.isArray(data.features)) continue;
        countriesCache = data;
        countriesTime = now;
        logger.info(`Countries GeoJSON cached from ${url}.`);
        return res.json(countriesCache);
      } catch (err) {
        logger.error(`Countries source failed (${url}):`, err.message);
      }
    }
    if (countriesCache) return res.json(countriesCache);
    res.status(500).json({ error: 'Countries GeoJSON unavailable' });
  };

  let usStatesCache = null;
  let usStatesTime = 0;
  
  const usStates = async (_req, res) => {
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
        logger.info(`US states GeoJSON cached from ${url}.`);
        return res.json(usStatesCache);
      } catch (err) {
        logger.error(`US states source failed (${url}):`, err.message);
      }
    }
  
    if (usStatesCache) return res.json(usStatesCache);
    res.status(500).json({ error: 'US states GeoJSON unavailable' });
  };

  return {
    iss,
    gpsJamming,
    countries,
    usStates,
  };
}

export { createGeoControllers };

