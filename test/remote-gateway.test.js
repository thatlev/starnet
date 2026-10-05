'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createGateway, createClient } = require('../remote/gateway');
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const close = server => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); };

test('gateway requires the verified numeric GitHub owner, expires sessions and never retries mutations', async () => {
  let calls = 0, time = 100;
  const runtime = http.createServer((req, res) => { calls++; res.setHeader('Content-Type', 'text/html'); res.end('<head></head>station'); });
  const runtimePort = await listen(runtime);
  const gateway = createGateway({ runtimePort, runtimeToken: 'private', ownerId: 42, now: () => time, sessionMs: 1000,
    verifyIdentity: async token => { if (token === 'bad') throw Error('bad'); return { id: token === 'owner' ? 42 : 43, login: 'owner' }; } });
  const base = 'http://127.0.0.1:' + await listen(gateway);
  const login = token => fetch(base + '/remote/login', { method: 'POST', body: JSON.stringify({ githubToken: token }) });
  try {
    for (const route of ['/', '/remote/bootstrap', '/api/state/snapshot', '/api/run', '/app/app.js']) assert.equal((await fetch(base + route)).status, 401);
    assert.equal(calls, 0);
    assert.equal((await login('bad')).status, 401);
    assert.equal((await login('someone')).status, 403);
    const session = await (await login('owner')).json();
    const headers = { Authorization: 'Bearer ' + session.token };
    const html = await (await fetch(base + '/', { headers })).text();
    assert.match(html, /__STARNET_REMOTE__/);
    const bootstrap = await fetch(base + '/remote/bootstrap', { headers });
    assert.deepEqual(await bootstrap.json(), { token: 'private' }, 'only the authenticated gateway can renew the station token');
    assert.equal((await fetch(base + '/remote/bootstrap', { headers: { ...headers, Origin: 'https://evil.example' } })).status, 403);
    assert.equal((await fetch(base + '/', { headers: { ...headers, Origin: 'https://evil.example' } })).status, 403);
    assert.equal(await new Promise(resolve => { const r = http.get(base + '/', { headers: { ...headers, Host: 'evil.example' } }, reply => { reply.resume(); resolve(reply.statusCode); }); r.on('error', () => resolve(0)); }), 403);
    assert.equal(calls, 1);
    time += 1001;
    assert.equal((await fetch(base + '/api/run', { method: 'POST', headers })).status, 401);
    assert.equal(calls, 1);
  } finally { await close(gateway); await close(runtime); }
});
test('local proxy rejects malicious origins and carries SSE immediately through both hops', async () => {
  const runtime = http.createServer((req, res) => {
    if (req.url === '/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('id: epoch:1\ndata: {"live":true}\n\n');
    } else { res.writeHead(403); res.end('forbidden token'); }
  });
  const runtimePort = await listen(runtime);
  const gateway = createGateway({ runtimePort, runtimeToken: 'private', ownerId: 42, verifyIdentity: async () => ({ id: 42, login: 'owner' }) });
  const gatewayPort = await listen(gateway);
  const session = await (await fetch('http://127.0.0.1:' + gatewayPort + '/remote/login', { method: 'POST', body: JSON.stringify({ githubToken: 'test' }) })).json();
  const client = createClient({ gatewayPort, localPort: 8790, getSession: async () => session });
  const base = 'http://127.0.0.1:' + await listen(client);
  try {
    assert.equal((await fetch(base + '/events', { headers: { Origin: 'https://evil.example' } })).status, 403);
    assert.equal((await fetch(base + '/api/run', { method: 'POST' })).status, 403);
    const start = Date.now(), ac = new AbortController();
    const response = await fetch(base + '/events', { signal: ac.signal });
    const frame = await response.body.getReader().read();
    assert.match(new TextDecoder().decode(frame.value), /epoch:1/);
    assert.ok(Date.now() - start < 500, 'SSE must flush without waiting for stream completion');
    ac.abort();
  } finally { await close(client); await close(gateway); await close(runtime); }
});

test('gateway reuses its runtime connection without retrying requests', async () => {
  const sockets = new Set(); let calls = 0;
  const runtime = http.createServer((req, res) => { sockets.add(req.socket); calls++; res.end('ok'); });
  const runtimePort = await listen(runtime);
  const gateway = createGateway({ runtimePort, runtimeToken: 'test', ownerId: 42, verifyIdentity: async () => ({ id: 42, login: 'fixture' }) });
  const base = 'http://127.0.0.1:' + await listen(gateway);
  try {
    const session = await (await fetch(base + '/remote/login', { method: 'POST', body: JSON.stringify({ githubToken: 'fixture' }) })).json();
    for (let i = 0; i < 4; i++) {
      const reply = await fetch(base + '/api/fixture', { method: 'POST', headers: { Authorization: 'Bearer ' + session.token }, body: '{}' });
      assert.equal(await reply.text(), 'ok');
    }
    assert.equal(calls, 4, 'exactly one upstream request per caller');
    assert.equal(sockets.size, 1, 'sequential requests reuse one TCP connection');
  } finally { await close(gateway); await close(runtime); }
});

test('viewer connection controls require same-origin custom-header requests and serialize changes', async () => {
  let sessions = 0, disconnects = 0, reconnects = 0, release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  const client = createClient({ gatewayPort: 1, localPort: 8790, getSession: async () => { sessions++; throw Error('offline'); }, connection: {
    status: () => ({ host: 'fixture-server', paused: disconnects > reconnects }),
    disconnect: async () => { disconnects++; entered(); await new Promise(resolve => { release = resolve; }); },
    reconnect: async () => { reconnects++; }
  } });
  const base = 'http://127.0.0.1:' + await listen(client);
  const headers = { 'x-starnet-client': '1', 'Content-Type': 'application/json' };
  const post = (action, extra = {}) => fetch(base + '/remote/client/' + action, { method: 'POST', headers: { ...headers, ...extra }, body: '{}' });
  try {
    assert.equal((await fetch(base + '/remote/client/status')).status, 403);
    assert.equal((await post('disconnect', { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await post('disconnect', { 'sec-fetch-site': 'cross-site' })).status, 403);
    assert.equal((await fetch(base + '/remote/client/disconnect', { headers })).status, 405);
    assert.deepEqual(await (await fetch(base + '/remote/client/status', { headers })).json(), { host: 'fixture-server', paused: false });
    const disconnect = post('disconnect'); await started;
    assert.equal((await post('reconnect')).status, 409);
    release(); assert.equal((await disconnect).status, 200);
    assert.equal((await (await fetch(base + '/remote/client/status', { headers })).json()).paused, true);
    assert.equal((await post('reconnect')).status, 200);
    assert.equal(sessions, 0, 'controls remain usable offline and never authenticate or forward a runtime request');
    assert.equal(disconnects, 1); assert.equal(reconnects, 1);
  } finally { release?.(); await close(client); }
});

test('both hops keep the static cache policy and compression, keep API replies uncached and the station page plain', async () => {
  const seen = [];
  const runtime = http.createServer((req, res) => {
    seen.push({ url: req.url, encoding: req.headers['accept-encoding'] || '', etag: req.headers['if-none-match'] || '' });
    if (req.url === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end('<html><head><title>—</title></head></html>'); }
    if (req.url.startsWith('/app/a.js')) {
      if (req.headers['if-none-match'] === '"h-br"') { res.writeHead(304, { ETag: '"h-br"', 'Cache-Control': 'no-cache' }); return res.end(); }
      const policy = req.url.includes('?v=h') ? 'public, max-age=31536000, immutable' : 'no-cache';
      res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': policy, ETag: '"h-br"', 'Content-Encoding': 'br', Vary: 'Accept-Encoding' });
      return res.end(require('node:zlib').brotliCompressSync('ok'));
    }
    if (req.url.startsWith('/api/')) { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }); return res.end('{}'); }
    res.writeHead(200, { 'Cache-Control': 'public, max-age=60' }); res.end('other');
  });
  const runtimePort = await listen(runtime);
  const gateway = createGateway({ runtimePort, runtimeToken: 'private', ownerId: 42, verifyIdentity: async () => ({ id: 42, login: 'owner' }) });
  const gatewayPort = await listen(gateway);
  const session = await (await fetch('http://127.0.0.1:' + gatewayPort + '/remote/login', { method: 'POST', body: JSON.stringify({ githubToken: 'test' }) })).json();
  const client = createClient({ gatewayPort, localPort: 8790, getSession: async () => session });
  const port = await listen(client);
  const get = (url, headers = {}) => new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: url, headers: { 'accept-encoding': 'br, gzip', ...headers } }, res => {
      const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
  try {
    const page = await get('/');
    assert.equal(page.headers['cache-control'], 'no-store');
    assert.match(page.body.toString(), /<title>—<\/title><script>window\.__STARNET_REMOTE__=true;/, 'the station page is rewritten intact');
    assert.equal(seen[0].encoding, '', 'the station page is requested uncompressed');
    const pinned = await get('/app/a.js?v=h');
    assert.equal(pinned.headers['cache-control'], 'public, max-age=31536000, immutable');
    assert.equal(pinned.headers['content-encoding'], 'br');
    assert.equal(require('node:zlib').brotliDecompressSync(pinned.body).toString(), 'ok');
    assert.equal(seen[1].encoding, 'br, gzip', 'the viewer\'s accepted encodings reach the station');
    assert.equal((await get('/app/a.js')).headers['cache-control'], 'no-cache');
    const revalidated = await get('/app/a.js', { 'if-none-match': '"h-br"' });
    assert.equal(revalidated.status, 304); assert.equal(revalidated.headers['cache-control'], 'no-cache');
    assert.equal((await get('/api/state')).headers['cache-control'], 'no-store', 'API replies are never cached');
    assert.equal((await get('/other')).headers['cache-control'], 'no-store', 'only the two static policies pass');
  } finally { await close(client); await close(gateway); await close(runtime); }
});
