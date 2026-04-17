import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { registerSatelliteRoutes } from '../server/routes/satellites.js';

function createSatellitesApp(baseDir) {
  const app = express();
  registerSatelliteRoutes(app, {
    path,
    fs,
    baseDir,
    HEADERS: {},
    fetch: async (url) => {
      if (url.includes('ivanstanojevic')) {
        return {
          ok: true,
          json: async () => ({
            member: [
              { name: 'SAT-ONE', line1: '1 00005U 58002B', line2: '2 00005 34.25 331.51' },
            ],
          }),
        };
      }
      return { ok: false, text: async () => '' };
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

test('GET /api/satellites returns fetched TLE list', async () => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'worldview-sat-'));
  const app = createSatellitesApp(baseDir);

  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/satellites`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(Array.isArray(body), true);
    assert.equal(body.length >= 1, true);
    assert.equal(body[0].name, 'SAT-ONE');
  });

  fs.rmSync(baseDir, { recursive: true, force: true });
});
