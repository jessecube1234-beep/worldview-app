function registerGeoRoutes(app, deps) {
  const { fetchWithTimeout, HEADERS, GPS_JAM_CACHE_TTL, envFallback, envValue } = deps;
  let gpsJamCache = null;
  let gpsJamCacheTime = 0;
  const ISS_API_URL_DEFAULT = 'https://api.wheretheiss.at/v1/satellites/25544';
  const GPS_JAM_URL_TEMPLATE_DEFAULT = 'https://rfi.stanford.edu/{YYYY-MM-DD}_{type}.json';
  const issApiUrl = envValue('ISS_API_URL', envFallback) || ISS_API_URL_DEFAULT;
  const GPS_JAM_FALLBACK_POINTS = [
    { lat: 49.3, lon: 31.2, severity: 3, region: 'Ukraine', note: 'GNSS interference hotspot (fallback demo data)' },
    { lat: 31.6, lon: 34.6, severity: 3, region: 'Gaza/Israel', note: 'GNSS interference hotspot (fallback demo data)' },
    { lat: 15.4, lon: 47.9, severity: 2, region: 'Red Sea / Yemen', note: 'GNSS interference hotspot (fallback demo data)' },
    { lat: 24.2, lon: 119.6, severity: 2, region: 'Taiwan Strait', note: 'GNSS interference hotspot (fallback demo data)' },
    { lat: 39.9, lon: 45.1, severity: 2, region: 'South Caucasus', note: 'GNSS interference hotspot (fallback demo data)' },
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
  
  async function fetchGpsJamPoints() {
    const explicitUrl = envValue('GPS_JAM_URL', envFallback);
    const templateUrl = envValue('GPS_JAM_URL_TEMPLATE', envFallback) || GPS_JAM_URL_TEMPLATE_DEFAULT;
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
  
    return { points: GPS_JAM_FALLBACK_POINTS, source: 'fallback' };
  }

  app.get('/api/iss', async (_req, res) => {
    try {
      const response = await fetchWithTimeout(issApiUrl);
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

}

module.exports = { registerGeoRoutes };
