import { createLogger } from '../utils/logger.js';

const logger = createLogger('flight-tracker');

function createFlightTracker({ fetchWithTimeout, HEADERS }) {
  const FLIGHT_CACHE_TTL = 60 * 1000;
  const ADSB_TIMEOUT_MS = 6500;
  const OPENSKY_TIMEOUT_MS = 3500;

  let flightsCache = null;
  let flightsCacheTime = 0;
  let flightsRefreshInFlight = null;

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
      alt_baro: Number.isFinite(baroAltM) ? baroAltM / 0.3048 : 0,
      gs: Number.isFinite(speedMs) ? speedMs * 1.94384 : null,
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

  async function refreshFlights(now = Date.now()) {
    const [milResult, laddResult, openskyResult] = await Promise.allSettled([
      fetchWithTimeout('https://api.adsb.lol/v2/mil', { headers: HEADERS, timeout: ADSB_TIMEOUT_MS }),
      fetchWithTimeout('https://api.adsb.lol/v2/ladd', { headers: HEADERS, timeout: ADSB_TIMEOUT_MS }),
      fetchWithTimeout('https://opensky-network.org/api/states/all', { headers: HEADERS, timeout: OPENSKY_TIMEOUT_MS }),
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
    if (ac.length) {
      flightsCache = ac;
      flightsCacheTime = now;
    }

    logger.info(`Tracked aircraft: ${ac.length} (mil:${milCount} ladd:${laddCount} global:${openskyAdded})`);
    return ac;
  }

  async function getFlights(now = Date.now()) {
    const hasFreshCache = flightsCache && (now - flightsCacheTime < FLIGHT_CACHE_TTL);
    if (hasFreshCache) return { ac: flightsCache, stale: false };

    if (flightsCache && !hasFreshCache) {
      if (!flightsRefreshInFlight) {
        flightsRefreshInFlight = refreshFlights(now).catch((err) => {
          logger.error('Flight background refresh error:', err.message);
          return null;
        }).finally(() => {
          flightsRefreshInFlight = null;
        });
      }
      return { ac: flightsCache, stale: true };
    }

    if (!flightsRefreshInFlight) {
      flightsRefreshInFlight = refreshFlights(now).finally(() => {
        flightsRefreshInFlight = null;
      });
    }
    const ac = await flightsRefreshInFlight;
    if (Array.isArray(ac) && ac.length) return { ac, stale: false };
    if (flightsCache) return { ac: flightsCache, stale: true };
    throw new Error('Flight feeds unavailable');
  }

  return {
    getFlights,
  };
}

export { createFlightTracker };
