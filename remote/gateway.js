'use strict';
// No GUI, native modules, third-party dependencies, or public listener. SSH supplies
// encryption and host authentication; GitHub supplies the exact owner identity.
const http = require('node:http');
const crypto = require('node:crypto');
const { isAllowedHost, isAllowedApiOrigin } = require('../sidecar/apiauth');

const json = (res, code, value) => {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
};
async function readJson(req, limit = 8192) {
  let text = '';
  for await (const chunk of req) {
    text += chunk;
    if (Buffer.byteLength(text) > limit) throw new Error('request too large');
  }
  return JSON.parse(text);
}
async function githubIdentity(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_]{20,255}$/.test(token)) throw new Error('invalid credential');
  const res = await fetch('https://api.github.com/user', {
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json',
      'User-Agent': 'StarNet-Remote', 'X-GitHub-Api-Version': '2022-11-28' },
    signal: AbortSignal.timeout(10000), redirect: 'error'
  });
  if (!res.ok) throw new Error('GitHub authentication failed');
  const user = await res.json();
  if (!Number.isSafeInteger(user.id) || typeof user.login !== 'string') throw new Error('invalid identity');
  return { id: user.id, login: user.login };
}

// Streaming proxy: never buffers run output or SSE. Losing a viewer closes only
// the transport. The runtime's server-owned run mode controls execution lifetime.
function proxy(req, res, { port, headers = {}, url = req.url, transformHtml, onUnauthorized }) {
  const forwarded = {};
  for (const key of ['content-type', 'accept', 'last-event-id', 'range', 'if-none-match', 'x-starnet-token', 'x-skynet-token']) {
    if (req.headers[key]) forwarded[key] = req.headers[key];
  }
  const upstream = http.request({ host: '127.0.0.1', port, method: req.method, path: url,
    headers: { ...forwarded, ...headers, host: '127.0.0.1:' + port }, agent: false }, reply => {
    if (reply.statusCode === 401) onUnauthorized?.();
    const out = { ...reply.headers, 'cache-control': 'no-store', 'x-accel-buffering': 'no' };
    delete out['access-control-allow-origin']; delete out['access-control-allow-credentials'];
    delete out['connection']; delete out['transfer-encoding'];
    if (transformHtml && String(reply.headers['content-type']).includes('text/html') && (url === '/' || url === '/index.html')) {
      let body = '', bytes = 0;
      reply.on('data', c => { bytes += c.length; if (bytes > 2 * 1024 * 1024) return upstream.destroy(); body += c; });
      reply.on('end', () => { delete out['content-length']; res.writeHead(reply.statusCode, out); res.end(transformHtml(body)); });
    } else {
      res.writeHead(reply.statusCode, out);
      res.flushHeaders();
      reply.pipe(res);
    }
    reply.on('error', () => res.destroy());
  });
  // Bound stalled reads; model/tool POSTs may legitimately take longer than a
  // minute before producing output and must retain their existing lifetime.
  if (req.method === 'GET' || req.method === 'HEAD') {
    upstream.setTimeout(45000, () => upstream.destroy(new Error('Gateway transport timed out')));
  }
  upstream.on('error', () => {
    if (!res.headersSent) json(res, 502, { error: 'The server connection is unavailable. Existing runs are not retried.' });
    else res.destroy();
  });
  req.on('aborted', () => upstream.destroy());
  res.on('close', () => upstream.destroy());
  req.pipe(upstream);
  return upstream;
}

function createGateway({ runtimePort, runtimeToken, ownerId, verifyIdentity = githubIdentity,
  now = Date.now, sessionMs = 12 * 60 * 60 * 1000 }) {
  if (!Number.isSafeInteger(ownerId) || ownerId <= 0 || !runtimeToken) throw new Error('ownerId and runtimeToken required');
  const sessions = new Map();
  let loginAttempts = [];
  const digest = value => crypto.createHash('sha256').update(value).digest('hex');
  const prune = () => { for (const [key, value] of sessions) if (value.expiresAt <= now()) sessions.delete(key); };
  const server = http.createServer(async (req, res) => {
    req.socket.setNoDelay(true);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    try {
      // Browser traffic must enter the trusted local client. The gateway accepts
      // only the SSH client protocol, not cross-origin browser requests.
      if (!isAllowedHost(req.headers.host) || req.headers.origin || req.headers['sec-fetch-site']) return json(res, 403, { error: 'untrusted transport' });
      prune();
      if (req.url === '/remote/login' && req.method === 'POST') {
        loginAttempts = loginAttempts.filter(t => t > now() - 60000);
        if (loginAttempts.length >= 10) return json(res, 429, { error: 'try again in one minute' });
        loginAttempts.push(now());
        const body = await readJson(req);
        let user;
        try { user = await verifyIdentity(body.githubToken); } catch (_) { return json(res, 401, { error: 'GitHub authentication failed' }); }
        body.githubToken = undefined; // never persist or log the GitHub credential
        if (user.id !== ownerId) return json(res, 403, { error: 'This GitHub account does not own the station' });
        if (sessions.size >= 32) return json(res, 429, { error: 'too many connected clients' });
        const token = crypto.randomBytes(32).toString('hex');
        const entry = { user, expiresAt: now() + sessionMs };
        sessions.set(digest(token), entry);
        return json(res, 200, { token, expiresAt: entry.expiresAt, user });
      }
      const bearer = String(req.headers.authorization || '');
      const token = bearer.startsWith('Bearer ') ? bearer.slice(7) : '';
      const session = token.length === 64 ? sessions.get(digest(token)) : null;
      if (!session) return json(res, 401, { error: 'GitHub sign-in required' });
      if (req.url === '/remote/logout' && req.method === 'POST') { sessions.delete(digest(token)); return json(res, 200, { ok: true }); }
      if (req.url === '/remote/bootstrap' && req.method === 'GET') return json(res, 200, { token: runtimeToken });
      if (req.url === '/remote/status' && req.method === 'GET') return json(res, 200, {
        mode: 'remote', host: 'LevServer', user: session.user, expiresAt: session.expiresAt, headless: true
      });
      if (!req.url.startsWith('/') || req.url.startsWith('//') || /[\r\n\\]/.test(req.url)) return json(res, 400, { error: 'invalid path' });
      // The client still supplies the runtime's per-launch API token. It protects
      // the local proxy from malicious sites, in addition to the GitHub session.
      return proxy(req, res, { port: runtimePort, headers: { origin: 'http://127.0.0.1:' + runtimePort },
        transformHtml: html => html.replace('</head>', '<script>window.__STARNET_REMOTE__=true;</script><script defer src="/app/remote-channels.js"></script><script defer src="/app/remote-status.js"></script></head>') });
    } catch (_) {
      if (!res.headersSent) json(res, 400, { error: 'invalid request' }); else res.destroy();
    }
  });
  server.headersTimeout = 15000;
  server.requestTimeout = 60000;
  server.maxConnections = 128;
  return server;
}

function createClient({ gatewayPort, localPort, getSession, invalidateSession }) {
  const server = http.createServer(async (req, res) => {
    req.socket.setNoDelay(true);
    if (!isAllowedHost(req.headers.host) || !isAllowedApiOrigin(req.headers.origin, localPort)
      || req.headers['sec-fetch-site'] === 'cross-site') return json(res, 403, { error: 'untrusted origin' });
    try {
      const session = await getSession();
      proxy(req, res, { port: gatewayPort, headers: { authorization: 'Bearer ' + session.token }, onUnauthorized: invalidateSession });
    } catch (_) { json(res, 503, { error: 'Reconnecting to LevServer. Existing runs continue on the server.' }); }
  });
  server.headersTimeout = 15000;
  server.requestTimeout = 60000;
  server.maxConnections = 128;
  return server;
}
module.exports = { createGateway, createClient, githubIdentity, proxy, readJson };
