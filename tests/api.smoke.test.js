import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/index.js';

let server;
let baseUrl;

before(async () => {
  const app = createApp({ envFallback: {} });
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  const addr = server.address();
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  if (!server) return;
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

test('GET /health returns service status', async () => {
  const res = await fetch(`${baseUrl}/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.service, 'worldview-app');
});

test('GET /config.js returns JS payload', async () => {
  const res = await fetch(`${baseUrl}/config.js`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') || '', /application\/javascript/);
  const text = await res.text();
  assert.match(text, /window\.WORLDVIEW_CONFIG/);
  assert.match(text, /cesiumIonToken/);
});

test('unknown API route returns JSON 404', async () => {
  const res = await fetch(`${baseUrl}/api/does-not-exist`);
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.error, 'API route not found');
});
