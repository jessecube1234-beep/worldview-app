function registerFlightRoutes(app, deps) {
  const { fetchWithTimeout, HEADERS } = deps;
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

  

}

module.exports = { registerFlightRoutes };
