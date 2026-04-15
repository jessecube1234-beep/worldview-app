require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');

const {
  PORT,
  HEADERS,
  TIMEOUT,
  WINDY_BASE_URLS,
  WINDY_CACHE_TTL,
  GPS_JAM_CACHE_TTL,
} = require('./server/config');
const { loadEnvFallback, envValue, validateEnvironment } = require('./server/utils/env');
const { requestLogger } = require('./server/middleware/requestLogger');
const { notFoundApi, errorHandler } = require('./server/middleware/errorHandler');
const { registerFlightRoutes } = require('./server/routes/flights');
const { registerSatelliteRoutes } = require('./server/routes/satellites');
const { registerGeoRoutes } = require('./server/routes/geo');
const { registerCameraRoutes } = require('./server/routes/cameras');
const { registerGeopoliticalRoutes } = require('./server/routes/geopolitical');

const app = express();
const envFallback = loadEnvFallback(__dirname);
validateEnvironment(envFallback);

app.use(cors());
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  next();
});
app.use(express.json());
app.use(requestLogger);
app.use(express.static(path.join(__dirname, 'public')));

const CESIUM_ION_TOKEN = envValue('CESIUM_ION_TOKEN', envFallback);
if (!CESIUM_ION_TOKEN) {
  console.warn('Cesium token missing (CESIUM_ION_TOKEN). Globe terrain may be limited.');
}

app.get('/config.js', (_req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const cfg = {
    cesiumIonToken: CESIUM_ION_TOKEN || '',
  };
  res.send(`window.WORLDVIEW_CONFIG = ${JSON.stringify(cfg)};`);
});

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true, service: 'worldview-app' });
});

const WINDY_KEY = envValue('WINDY_WEBCAMS_KEY', envFallback);
if (!WINDY_KEY) {
  console.warn('Windy API key missing (WINDY_WEBCAMS_KEY). /api/cameras/windy will return 503.');
}

function fetchWithTimeout(url, opts = {}) {
  return fetch(url, { ...opts, timeout: TIMEOUT });
}

registerFlightRoutes(app, { fetchWithTimeout, HEADERS });
registerSatelliteRoutes(app, { path, fs, baseDir: __dirname, fetch, HEADERS });
registerGeoRoutes(app, {
  fetchWithTimeout,
  HEADERS,
  GPS_JAM_CACHE_TTL,
  envFallback,
  envValue,
});
registerCameraRoutes(app, {
  fetch,
  fetchWithTimeout,
  HEADERS,
  WINDY_KEY,
  WINDY_BASE_URLS,
  WINDY_CACHE_TTL,
});
registerGeopoliticalRoutes(app, { fetchWithTimeout, HEADERS });

app.use(notFoundApi);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`\nWorldView server running at http://localhost:${PORT}\n`);
});
