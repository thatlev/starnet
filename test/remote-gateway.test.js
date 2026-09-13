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
    for (const route of ['/', '/api/state/snapshot', '/api/run', '/app/app.js']) assert.equal((await fetch(base + route)).status, 401);
    assert.equal(calls, 0);
    assert.equal((await login('bad')).status, 401);
    assert.equal((await login('someone')).status, 403);
    const session = await (await login('owner')).json();
    const headers = { Authorization: 'Bearer ' + session.token };
    const html = await (await fetch(base + '/', { headers })).text();
    assert.match(html, /__STARNET_REMOTE__/);
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
