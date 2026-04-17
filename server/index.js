import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  PORT,
  HEADERS,
  TIMEOUT,
  WINDY_BASE_URLS,
  WINDY_CACHE_TTL,
  GPS_JAM_CACHE_TTL,
} from './config.js';
import { loadEnvFallback, envValue, validateEnvironment } from './utils/env.js';
import { createLogger } from './utils/logger.js';
import { requestLogger } from './middleware/requestLogger.js';
import { notFoundApi, errorHandler } from './middleware/errorHandler.js';
import { registerFlightRoutes } from './routes/flights.js';
import { registerSatelliteRoutes } from './routes/satellites.js';
import { registerGeoRoutes } from './routes/geo.js';
import { registerCameraRoutes } from './routes/cameras.js';
import { registerGeopoliticalRoutes } from './routes/geopolitical.js';

try {
  // Optional in production (Elastic Beanstalk injects env vars directly).
  await import('dotenv/config');
} catch (_) {}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const logger = createLogger('server');

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
    logger.warn('Cesium token missing (CESIUM_ION_TOKEN). Globe terrain may be limited.');
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
    logger.warn('Windy API key missing (WINDY_WEBCAMS_KEY). /api/cameras/windy will return 503.');
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
  registerGeopoliticalRoutes(app, {
    fetchWithTimeout,
    HEADERS,
    envFallback,
    envValue,
  });

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
    logger.info(`WorldView server running at http://localhost:${port}`);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  startServer();
}

export { createApp, startServer };
