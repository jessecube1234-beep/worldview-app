import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { registerFlightRoutes } from '../server/routes/flights.js';

function createFlightsApp() {
  const app = express();
  registerFlightRoutes(app, {
    HEADERS: {},
    fetchWithTimeout: async (url) => {
      if (url.includes('/mil')) {
        return {
          ok: true,
          json: async () => ({
            ac: [{ hex: 'abc123', lat: 10, lon: 20, flight: 'MIL1' }],
          }),
        };
      }
      if (url.includes('/ladd')) {
        return {
          ok: true,
          json: async () => ({
            ac: [{ hex: 'def456', lat: 11, lon: 21, flight: 'LADD1' }],
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          states: [
            ['xyz789', ' OPN1 ', 'OpenSky', null, null, 30, 40, 10000, null, 200, 90],
          ],
        }),
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

test('GET /api/flights returns merged flight sources', async () => {
  const app = createFlightsApp();

  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/flights`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(Array.isArray(body.ac), true);
    assert.equal(body.ac.length >= 3, true);
    const hexes = new Set(body.ac.map((ac) => ac.hex));
    assert.equal(hexes.has('abc123'), true);
    assert.equal(hexes.has('def456'), true);
    assert.equal(hexes.has('xyz789'), true);
  });
});
