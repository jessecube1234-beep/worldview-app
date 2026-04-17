import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { registerGeopoliticalRoutes } from '../server/routes/geopolitical.js';

function createGeopoliticalApp() {
  const app = express();
  registerGeopoliticalRoutes(app, {
    HEADERS: {},
    fetchWithTimeout: async (url) => {
      if (url.includes('gdeltproject.org')) {
        return {
          ok: true,
          json: async () => ({
            articles: [
              {
                title: 'Missile strike escalates conflict in Ukraine',
                url: 'https://news.example/ukraine-strike',
                domain: 'news.example',
                seendate: '20260416T120000Z',
              },
            ],
          }),
        };
      }

      return {
        ok: false,
        status: 503,
        text: async () => 'unavailable',
      };
    },
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

test('GET /api/geopolitical returns normalized live events when sources respond', async () => {
  const app = createGeopoliticalApp();
  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/geopolitical?timeline=24h`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(Array.isArray(body.events), true);
    assert.equal(body.events.length >= 1, true);
    assert.equal(body.events[0].location, 'Ukraine');
    assert.equal(typeof body.events[0].confidence?.score, 'number');
  });
});
