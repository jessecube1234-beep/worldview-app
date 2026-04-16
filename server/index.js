try {
  // Optional in production (Elastic Beanstalk injects env vars directly).
  require('dotenv').config();
} catch (_) {}
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const PROJECT_ROOT = path.resolve(__dirname, '..');

const {
  PORT,
  HEADERS,
  TIMEOUT,
  WINDY_BASE_URLS,
  WINDY_CACHE_TTL,
  GPS_JAM_CACHE_TTL,
} = require('./config');
const { loadEnvFallback, envValue, validateEnvironment } = require('./utils/env');
const { requestLogger } = require('./middleware/requestLogger');
const { notFoundApi, errorHandler } = require('./middleware/errorHandler');
const { registerFlightRoutes } = require('./routes/flights');
const { registerSatelliteRoutes } = require('./routes/satellites');
const { registerGeoRoutes } = require('./routes/geo');
const { registerCameraRoutes } = require('./routes/cameras');
const { registerGeopoliticalRoutes } = require('./routes/geopolitical');

function createApp(options = {}) {
  const app = express();
  const envFallback = options.envFallback || loadEnvFallback(PROJECT_ROOT);
  validateEnvironment(envFallback);
  const distDir = path.join(PROJECT_ROOT, 'dist');
  const hasDistBuild = fs.existsSync(path.join(distDir, 'index.html'));

  app.use(cors());
  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    next();
  });
  app.use(express.json());
  app.use(requestLogger);
  if (hasDistBuild) {
    app.use(express.static(distDir));
  }

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
  registerSatelliteRoutes(app, { path, fs, baseDir: PROJECT_ROOT, fetch, HEADERS });
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

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      next();
      return;
    }
    if (hasDistBuild) {
      return res.sendFile(path.join(distDir, 'index.html'));
    }
    return res.status(503).send(
      '<!doctype html><html><head><meta charset="utf-8"><title>WorldView</title></head><body>' +
      '<h1>Frontend build missing</h1><p>Run <code>npm run build</code> and restart the server.</p>' +
      '</body></html>'
    );
  });

  app.use(notFoundApi);
  app.use(errorHandler);

  return app;
}

function startServer(port = PORT) {
  const app = createApp();
  return app.listen(port, () => {
    console.log(`\nWorldView server running at http://localhost:${port}\n`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { createApp, startServer };
