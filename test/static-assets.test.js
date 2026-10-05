'use strict';
// node --test test/static-assets.test.js — the station's frontend files: hashed URLs, caching, compression, safety.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { makeStaticAssets, acceptedEncodings, matchesEtag } = require('../sidecar/static-assets');
const { MIME } = require('../sidecar/file-response');

const hashOf = data => crypto.createHash('sha256').update(data).digest('base64url').slice(0, 16);
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
function request(port, url, headers = {}, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: url, method, headers }, res => {
      const chunks = []; res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject); req.end();
  });
}

async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'starnet-static-'));
  fs.mkdirSync(path.join(root, 'app')); fs.mkdirSync(path.join(root, 'css')); fs.mkdirSync(path.join(root, 'assets'));
  const script = Buffer.from('/* app */\n' + 'window.stationReady = true; // ✓ unicode\n'.repeat(200));
  const style = Buffer.from('body { color: #e8b04b; }\n'.repeat(100));
  const image = crypto.randomBytes(3000);
  fs.writeFileSync(path.join(root, 'app', 'a.js'), script);
  fs.writeFileSync(path.join(root, 'css', 'b.css'), style);
  fs.writeFileSync(path.join(root, 'assets', 'c.png'), image);
  fs.writeFileSync(path.join(root, 'tiny.js'), 'x');
  fs.writeFileSync(path.join(root, 'index.html'), '<html><head><title>— StarNet</title>' +
    '<link rel="stylesheet" href="css/b.css?v=5">\n<script src="app/a.js"></script>\n<script defer src="/app/abs.js"></script>\n' +
    '<script src="https://cdn.example/x.js"></script>\n<script src="app/missing.js"></script>\n' +
    '<script>document.write(\'<script src="\' + base + \'/shared/s.js"></\' + \'script>\')</script></head><body></body></html>');
  fs.writeFileSync(path.join(path.dirname(root), path.basename(root) + '-secret.txt'), 'secret');
  const assets = makeStaticAssets({ root, mime: MIME });
  const server = http.createServer((req, res) => assets.serve(req, res, {
    bootDocument: abs => abs === path.join(root, 'index.html'),
    bootScript: () => '<script>window.__TOKEN__="t";</script>'
  }));
  const port = await listen(server);
  t.after(() => { server.closeAllConnections(); server.close(); fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(root + '-secret.txt', { force: true }); });
  return { root, port, script, style, image, assets };
}

test('the boot document is never cached, carries the boot script and pins local scripts and styles to their content', async t => {
  const f = await fixture(t);
  const page = await request(f.port, '/', { 'accept-encoding': 'br, gzip' });
  const html = page.body.toString('utf8');
  assert.equal(page.status, 200);
  assert.equal(page.headers['cache-control'], 'no-store');
  assert.equal(page.headers['content-encoding'], undefined, 'the boot document stays plain text for the remote gateway');
  assert.match(html, /window\.__TOKEN__="t";<\/script>\n<\/head>/);
  assert.ok(html.includes('src="app/a.js?v=' + hashOf(f.script) + '"'));
  assert.ok(html.includes('href="css/b.css?v=' + hashOf(f.style) + '"'), 'a hand-written ?v= is replaced by the content hash');
  for (const kept of ['src="/app/abs.js"', 'src="https://cdn.example/x.js"', 'src="app/missing.js"', '/shared/s.js']) assert.ok(html.includes(kept), kept);
  assert.ok(html.includes('— StarNet'), 'multibyte text survives');
});

test('hashed files are immutable, other files revalidate, and both answer a matching ETag with an empty 304', async t => {
  const f = await fixture(t);
  const hash = hashOf(f.script);
  const pinned = await request(f.port, '/app/a.js?v=' + hash);
  assert.equal(pinned.headers['cache-control'], 'public, max-age=31536000, immutable');
  assert.deepEqual(pinned.body, f.script);
  assert.equal(pinned.headers['content-length'], String(f.script.length));
  for (const url of ['/app/a.js', '/app/a.js?v=stale', '/app/a.js?x=' + hash]) {
    assert.equal((await request(f.port, url)).headers['cache-control'], 'no-cache', url);
  }
  const again = await request(f.port, '/app/a.js', { 'if-none-match': pinned.headers.etag });
  assert.equal(again.status, 304); assert.equal(again.body.length, 0);
  const image = await request(f.port, '/assets/c.png');
  assert.deepEqual(image.body, f.image);
  assert.equal(image.headers['cache-control'], 'no-cache');
  assert.match(image.headers.etag, /^W\/"/);
  assert.equal((await request(f.port, '/assets/c.png', { 'if-none-match': image.headers.etag })).status, 304);
  const head = await request(f.port, '/app/a.js', {}, 'HEAD');
  assert.equal(head.status, 200); assert.equal(head.body.length, 0);
});

test('text files are compressed with the best accepted encoding, each with its own ETag', async t => {
  const f = await fixture(t);
  const br = await request(f.port, '/app/a.js', { 'accept-encoding': 'gzip, deflate, br' });
  assert.equal(br.headers['content-encoding'], 'br');
  assert.equal(br.headers.vary, 'Accept-Encoding');
  assert.ok(br.body.length < f.script.length / 4);
  assert.deepEqual(zlib.brotliDecompressSync(br.body), f.script);
  const gz = await request(f.port, '/app/a.js', { 'accept-encoding': 'gzip, br;q=0' });
  assert.equal(gz.headers['content-encoding'], 'gzip');
  assert.deepEqual(zlib.gunzipSync(gz.body), f.script);
  const plain = await request(f.port, '/app/a.js');
  assert.equal(plain.headers['content-encoding'], undefined);
  assert.equal(new Set([br.headers.etag, gz.headers.etag, plain.headers.etag]).size, 3);
  assert.equal((await request(f.port, '/app/a.js', { 'accept-encoding': 'gzip', 'if-none-match': br.headers.etag })).status, 200,
    'a cached brotli copy does not validate a gzip reply');
  assert.equal((await request(f.port, '/tiny.js', { 'accept-encoding': 'br' })).headers['content-encoding'], undefined, 'tiny files are sent as they are');
  const parallel = await Promise.all(Array.from({ length: 8 }, () => request(f.port, '/css/b.css', { 'accept-encoding': 'br' })));
  for (const reply of parallel) assert.deepEqual(zlib.brotliDecompressSync(reply.body), f.style);
});

test('an edited file gets a new hash at once and the old hash stops being immutable', async t => {
  const f = await fixture(t);
  const before = hashOf(f.script);
  const next = Buffer.from('window.stationReady = "edited";\n'.repeat(80));
  fs.writeFileSync(path.join(f.root, 'app', 'a.js'), next);
  const later = new Date(Date.now() + 5000); fs.utimesSync(path.join(f.root, 'app', 'a.js'), later, later);
  const html = (await request(f.port, '/')).body.toString();
  assert.ok(html.includes('app/a.js?v=' + hashOf(next)));
  const stale = await request(f.port, '/app/a.js?v=' + before);
  assert.equal(stale.headers['cache-control'], 'no-cache');
  assert.deepEqual(stale.body, next);
});

test('paths outside the frontend, folders and missing files are refused', async t => {
  const f = await fixture(t);
  const secret = '/../' + path.basename(f.root) + '-secret.txt';
  assert.equal((await request(f.port, '/%2e%2e/' + path.basename(f.root) + '-secret.txt')).status, 403);
  assert.equal((await request(f.port, secret)).status, 403);
  assert.equal((await request(f.port, '/app')).status, 404);
  assert.equal((await request(f.port, '/nope.js')).status, 404);
  assert.equal((await request(f.port, '/%E0%A4%A')).status, 404);
  assert.equal((await request(f.port, '/app/%00.js')).status, 404);
});

test('the memory budget evicts the oldest files and still serves everything', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'starnet-static-budget-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const files = Array.from({ length: 6 }, (_, i) => Buffer.from(String(i).repeat(40000)));
  files.forEach((data, i) => fs.writeFileSync(path.join(root, i + '.js'), data));
  const assets = makeStaticAssets({ root, mime: MIME, maxCacheBytes: 100000 });
  const server = http.createServer((req, res) => assets.serve(req, res));
  const port = await listen(server);
  t.after(() => { server.closeAllConnections(); server.close(); });
  for (let round = 0; round < 2; round++) {
    for (let i = 0; i < files.length; i++) assert.deepEqual((await request(port, '/' + i + '.js', { 'accept-encoding': 'gzip' })).body.length > 0, true);
  }
  for (let i = 0; i < files.length; i++) assert.deepEqual(zlib.gunzipSync((await request(port, '/' + i + '.js', { 'accept-encoding': 'gzip' })).body), files[i]);
  assert.ok(assets.stats().bytes <= 100000 + 45000, 'the cache stays near its budget');
});

test('encoding and ETag parsing', () => {
  assert.deepEqual([...acceptedEncodings('gzip;q=1.0, br;q=0, identity')], ['gzip', 'identity']);
  assert.deepEqual([...acceptedEncodings('')], []);
  assert.equal(matchesEtag('"a", W/"b"', '"b"'), true);
  assert.equal(matchesEtag('*', '"x"'), true);
  assert.equal(matchesEtag('"a"', '"b"'), false);
  assert.equal(matchesEtag(undefined, '"b"'), false);
});

test('an installed release pins images to a release token that changes with any file', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'starnet-static-release-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'assets'));
  const image = crypto.randomBytes(5000);
  fs.writeFileSync(path.join(root, 'assets', 'tex.png'), image);
  fs.writeFileSync(path.join(root, 'assets', 'manifest.json'), JSON.stringify({ version: 1, pad: 'x'.repeat(2000) }));
  fs.writeFileSync(path.join(root, 'index.html'), '<html><head></head><body></body></html>');
  const start = async release => {
    const assets = makeStaticAssets({ root, mime: MIME, release });
    const server = http.createServer((req, res) => assets.serve(req, res, { bootDocument: abs => abs.endsWith('index.html'), bootScript: () => '<script>boot()</script>' }));
    const port = await listen(server);
    t.after(() => { server.closeAllConnections(); server.close(); });
    return { assets, port };
  };
  const dev = await start('');
  assert.equal(await dev.assets.releaseToken(), '');
  const devPage = (await request(dev.port, '/')).body.toString();
  assert.ok(!devPage.includes('__STARNET_ASSET_V__'), 'development pages publish no token');
  assert.equal((await request(dev.port, '/assets/tex.png?v=')).headers['cache-control'], 'no-cache');

  const live = await start('0123456789abcdef');
  const token = await live.assets.releaseToken();
  assert.match(token, /^[A-Za-z0-9_-]{12}$/);
  const page = (await request(live.port, '/')).body.toString();
  assert.ok(page.includes('<script>window.__STARNET_ASSET_V__=' + JSON.stringify(token) + ';</script><script>boot()</script>\n</head>'));
  const pinned = await request(live.port, '/assets/tex.png?v=' + token);
  assert.equal(pinned.headers['cache-control'], 'public, max-age=31536000, immutable');
  assert.deepEqual(pinned.body, image);
  assert.equal((await request(live.port, '/assets/manifest.json?v=' + token)).headers['cache-control'], 'public, max-age=31536000, immutable');
  for (const url of ['/assets/tex.png', '/assets/tex.png?v=old', '/assets/tex.png?v=']) assert.equal((await request(live.port, url)).headers['cache-control'], 'no-cache', url);

  fs.writeFileSync(path.join(root, 'assets', 'tex.png'), crypto.randomBytes(5001));
  const next = await start('0123456789abcdef');
  assert.notEqual(await next.assets.releaseToken(), token, 'a changed file changes the token');
  assert.notEqual(await (await start('fedcba9876543210')).assets.releaseToken(), await next.assets.releaseToken(), 'a new release changes the token');
});

test('a caller can serve a file under its own root whatever the request path (the /shared scripts)', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'starnet-static-shared-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const script = Buffer.from('module.exports = 1;\n'.repeat(200));
  fs.writeFileSync(path.join(root, 'specialties.js'), script);
  const assets = makeStaticAssets({ root, mime: MIME });
  const server = http.createServer((req, res) => assets.serve(req, res, { path: req.url.split('?')[0].replace(/^\/shared\//, '') }));
  const port = await listen(server);
  t.after(() => { server.closeAllConnections(); server.close(); });
  const reply = await request(port, '/shared/specialties.js', { 'accept-encoding': 'gzip' });
  assert.equal(reply.status, 200);
  assert.equal(reply.headers['cache-control'], 'no-cache');
  assert.deepEqual(zlib.gunzipSync(reply.body), script);
  assert.equal((await request(port, '/shared/specialties.js', { 'accept-encoding': 'gzip', 'if-none-match': reply.headers.etag })).status, 304);
  assert.equal((await request(port, '/shared/../x.js')).status, 403);
});

test('a verified asset token pins images without fingerprinting the tree', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'starnet-static-token-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'assets'));
  fs.writeFileSync(path.join(root, 'assets', 'tex.png'), crypto.randomBytes(3000));
  fs.writeFileSync(path.join(root, 'index.html'), '<html><head></head></html>');
  const pin = ['art', 'pin', '1'].join('-');   // a fixture value, built so it never reads as a credential
  const assets = makeStaticAssets({ root, mime: MIME, release: 'abc', assetToken: pin });
  assert.equal(await assets.releaseToken(), pin);
  const server = http.createServer((req, res) => assets.serve(req, res, { bootDocument: abs => abs.endsWith('index.html') }));
  const port = await listen(server);
  t.after(() => { server.closeAllConnections(); server.close(); });
  assert.ok((await request(port, '/')).body.toString().includes('window.__STARNET_ASSET_V__="art-pin-1"'));
  assert.equal((await request(port, '/assets/tex.png?v=art-pin-1')).headers['cache-control'], 'public, max-age=31536000, immutable');
});
