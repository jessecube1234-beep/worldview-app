import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { registerCameraRoutes } from '../server/routes/cameras.js';

function createCamerasApp(overrides = {}) {
  const app = express();
  registerCameraRoutes(app, {
    fetch: async () => ({ ok: false, json: async () => ({}) }),
    fetchWithTimeout: async () => ({
      ok: true,
      json: async () => ({
        webcams: [
          {
            title: 'Test Cam',
            location: { latitude: 1.5, longitude: 103.8 },
            images: { current: { preview: 'https://example.test/cam.jpg' } },
            player: { day: { hd: 'https://example.test/stream' } },
          },
        ],
      }),
    }),
    HEADERS: {},
    WINDY_KEY: '',
    WINDY_BASE_URLS: ['https://api.windy.com/webcams/api/v3/webcams'],
    WINDY_CACHE_TTL: 60_000,
    ...overrides,
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

test('GET /api/cameras/windy returns 503 when key missing', async () => {
  const app = createCamerasApp({ WINDY_KEY: '' });
  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/cameras/windy?lat=1&lon=2`);
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.match(body.error, /not configured/i);
  });
});

test('GET /api/cameras/windy returns normalized webcams', async () => {
  const app = createCamerasApp({ WINDY_KEY: 'demo-key' });
  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/cameras/windy?lat=1.3&lon=103.8`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(Array.isArray(body), true);
    assert.equal(body.length, 1);
    assert.equal(body[0].name, 'Test Cam');
  });
});
