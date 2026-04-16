import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { registerGeoRoutes } from '../server/routes/geo.js';

function createGeoApp({ fetchImpl, envMap = {} } = {}) {
  const app = express();
  registerGeoRoutes(app, {
    fetchWithTimeout: fetchImpl || (async () => ({ ok: false, json: async () => ({}) })),
    HEADERS: {},
    GPS_JAM_CACHE_TTL: 60_000,
    envFallback: {},
    envValue: (key) => envMap[key] || '',
  });
  return app;
}

async function withServer(app, fn) {
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const addr = server.address();
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  try {
    await fn(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

test('GET /api/iss returns live ISS payload from configured source', async () => {
  const app = createGeoApp({
    envMap: { ISS_API_URL: 'https://example.test/iss' },
    fetchImpl: async (url) => {
      if (url !== 'https://example.test/iss') return { ok: false, json: async () => ({}) };
      return {
        ok: true,
        json: async () => ({
          latitude: 10.1234,
          longitude: 20.5678,
          altitude: 418.5,
          velocity: 27600,
        }),
      };
    },
  });

  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/iss`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.latitude, 10.1234);
    assert.equal(body.longitude, 20.5678);
  });
});

test('GET /api/gps-jamming returns live points when GPS_JAM_URL succeeds', async () => {
  const liveUrl = 'https://example.test/gps-live.json';
  const app = createGeoApp({
    envMap: { GPS_JAM_URL: liveUrl, GPS_JAM_URL_TEMPLATE: '' },
    fetchImpl: async (url) => {
      if (url !== liveUrl) return { ok: false, json: async () => ({}) };
      return {
        ok: true,
        json: async () => ({
          points: [
            { lat: 48.2, lon: 35.1, severity: 3, region: 'Test Region' },
          ],
        }),
      };
    },
  });

  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/gps-jamming`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.cached, false);
    assert.equal(body.source, liveUrl);
    assert.equal(Array.isArray(body.points), true);
    assert.equal(body.points.length, 1);
    assert.equal(body.points[0].region, 'Test Region');
  });
});

test('GET /api/gps-jamming falls back to demo points when all sources fail', async () => {
  const app = createGeoApp({
    envMap: { GPS_JAM_URL: 'https://bad.test/gps.json', GPS_JAM_URL_TEMPLATE: '' },
    fetchImpl: async () => {
      throw new Error('network unavailable');
    },
  });

  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/gps-jamming`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.cached, true);
    assert.equal(body.source, 'fallback');
    assert.equal(Array.isArray(body.points), true);
    assert.equal(body.points.length > 0, true);
  });
});
