function createSingaporeHandler({ fetch, HEADERS }) {
  let sgCache = null;
  let sgTime = 0;

  return async function singaporeHandler(_req, res) {
    const now = Date.now();
    if (sgCache && now - sgTime < 300_000) return res.json(sgCache);

    const sgUrls = [
      'https://api.data.gov.sg/v1/transport/traffic-images',
      'https://datamall2.mytransport.sg/ltaodataservice/Traffic-Imagesv2',
    ];

    for (const url of sgUrls) {
      try {
        const response = await fetch(url, { headers: HEADERS, timeout: 10000 });
        if (!response.ok) continue;
        const data = await response.json();
        const rawCams = data.items?.[0]?.cameras || data.value || [];
        if (!rawCams.length) continue;
        const cameras = rawCams.map((cam) => ({
          name: `CAM ${cam.camera_id || cam.CameraID}`,
          lat: cam.location?.latitude ?? cam.Latitude,
          lon: cam.location?.longitude ?? cam.Longitude,
          imageUrl: cam.image ?? cam.ImageLink,
        })).filter((cam) => cam.lat && cam.lon && cam.imageUrl);
        if (!cameras.length) continue;

        sgCache = cameras;
        sgTime = now;
        return res.json(cameras);
      } catch (_) {}
    }

    if (sgCache) return res.json(sgCache);
    return res.status(500).json({ error: 'Singapore camera API unavailable' });
  };
}

function createWindyHandler({ fetchWithTimeout, HEADERS, WINDY_KEY, WINDY_BASE_URLS, WINDY_CACHE_TTL }) {
  const windyCache = new Map();

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
    const endpoints = WINDY_BASE_URLS.map((base) => `${base}?${v3Params.toString()}`);
    const attempts = [];

    for (const url of endpoints) {
      const response = await fetchWithTimeout(url, {
        headers: { ...HEADERS, 'x-windy-api-key': WINDY_KEY },
        timeout: 20000,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '<no body>');
        attempts.push({ status: response.status, body, url });
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

  return async function windyHandler(req, res) {
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
      ].map((r) => Math.round(Math.min(200, r)));
      const radii = [...new Set(candidateRadii)];

      let cameras = [];
      for (const searchRadius of radii) {
        cameras = await fetchWindyCameras(lat, lon, searchRadius);
        if (Array.isArray(cameras) && cameras.length) {
          return res.json(cameras);
        }
      }

      return res.json([]);
    } catch (err) {
      return res.status(err.status || 502).json({
        error: err.message,
        details: err.details || null,
        endpoint: err.endpoint || null,
        attempts: err.attempts || [],
      });
    }
  };
}

function createLondonHandler({ fetchWithTimeout, HEADERS }) {
  let tflCache = null;
  let tflTime = 0;

  return async function londonHandler(_req, res) {
    const now = Date.now();
    if (tflCache && now - tflTime < 3_600_000) return res.json(tflCache);
    try {
      const response = await fetchWithTimeout('https://api.tfl.gov.uk/Place/Type/JamCam', { headers: HEADERS });
      if (!response.ok) throw new Error(`TfL API ${response.status}`);
      const data = await response.json();
      const cams = data
        .filter((cam) =>
          cam.lat > 51.45 && cam.lat < 51.56 &&
          cam.lon > -0.22 && cam.lon < 0.05
        )
        .map((cam) => ({
          name: cam.commonName,
          lat: cam.lat,
          lon: cam.lon,
          imageUrl: cam.additionalProperties?.find((prop) => prop.key === 'imageUrl')?.value,
        }))
        .filter((cam) => cam.imageUrl)
        .slice(0, 9);
      tflCache = cams;
      tflTime = now;
      return res.json(cams);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  };
}

function createCamProxyHandler({ fetchWithTimeout, HEADERS }) {
  const allowedCamHosts = [
    's3-eu-west-1.amazonaws.com',
    'jamcams.tfl.gov.uk',
    'images.data.gov.sg',
    'api.data.gov.sg',
  ];

  return async function camProxyHandler(req, res) {
    const url = req.query.url;
    if (!url) return res.status(400).send('Missing url');
    let hostname;
    try {
      hostname = new URL(url).hostname;
    } catch {
      return res.status(400).send('Bad url');
    }
    if (!allowedCamHosts.some((host) => hostname.endsWith(host))) {
      return res.status(403).send('Host not allowed');
    }
    try {
      const response = await fetchWithTimeout(url, { headers: HEADERS });
      if (!response.ok) return res.status(response.status).send('Upstream error');
      res.set('Content-Type', response.headers.get('content-type') || 'image/jpeg');
      response.body.pipe(res);
    } catch (err) {
      return res.status(500).send(err.message);
    }
  };
}

export {
  createSingaporeHandler,
  createWindyHandler,
  createLondonHandler,
  createCamProxyHandler,
};
