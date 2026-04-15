function registerSatelliteRoutes(app, deps) {
  const { path, fs, baseDir, fetch, HEADERS } = deps;
  const SAT_CACHE_FILE = path.join(baseDir, 'tle-cache.json');

  let satCache     = null;

  let satCacheTime = 0;

  

  // Pre-load from disk so restarts don't re-fetch

  try {

    const raw    = fs.readFileSync(SAT_CACHE_FILE, 'utf8');

    satCache     = JSON.parse(raw);

    satCacheTime = Date.now() - 3_000_000; // treat as 50 min old ? refresh within 10 min

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

        console.log(`  ? ${r.status} ${r.statusText}`);

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

          console.log(`  ? Got ${sats.length} satellites from ${src.url}`);

          return sats;

        }

        console.warn(`  ? Parsed 0 satellites`);

      } catch (e) {

        console.error(`  ? ${e.message}`);

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

  

  // -- Satellite debug: test each source live ------------------------------------

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

  

}

module.exports = { registerSatelliteRoutes };
