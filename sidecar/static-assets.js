/* sidecar/static-assets.js — serve the station's own frontend files quickly and correctly.

   The station page loads ~270 scripts and stylesheets (about 10 MB). Over a remote station's SSH tunnel every
   launch used to download all of them again (Cache-Control: no-store, no compression). Now:

     • A boot document (index.html) is never cached: it carries the per-launch API token. Each local script and
       stylesheet URL in it gets ?v=<content hash>, so a new release changes the URL of every changed file.
     • A request whose ?v= matches the file's current content hash is cacheable for a year (immutable). A stale or
       missing hash gets the current file with Cache-Control: no-cache, so it is never stored under the wrong URL.
     • An installed release also has an asset token. The boot document publishes it as window.__STARNET_ASSET_V__
       and the page asks for its images as assets/…?v=<token> (U.assetUrl), so those are immutable too until the
       token changes. opts.assetToken is a token from the release's verified checksums of its assets (it changes
       only when an asset does); without one, opts.release (the release id) is fingerprinted together with every
       file's size and time, which changes with every release.
     • Every other file is no-cache with an ETag: a returning page revalidates it with an empty 304.
     • Text files (scripts, styles, JSON, SVG) are compressed once with brotli or gzip and kept in memory, within
       a byte budget. Images, audio and large files stream from disk with a size-and-time ETag.

   makeStaticAssets({ root, mime, release?, assetToken?, maxCacheBytes? })
     .serve(req, res, { bootDocument?(abs) -> bool, bootScript?() -> string, path? })   // resolves when the reply ends;
                                                       // path: the file path under root when it differs from req.url
     .versionAssets(html, dir) -> Promise<string>                                  // exported for tests
     .releaseToken() -> Promise<string>          // '' while developing (no release id); computed once, in the background */
'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { promisify } = require('node:util');

const brotli = promisify(zlib.brotliCompress);
const gzip = promisify(zlib.gzip);
const IMMUTABLE = 'public, max-age=31536000, immutable';
const REVALIDATE = 'no-cache';
const TEXT_EXTS = new Set(['.js', '.mjs', '.css', '.json', '.map', '.svg', '.txt', '.md', '.html', '.htm', '.xml', '.webmanifest']);
const MAX_TEXT_BYTES = 4 * 1024 * 1024;   // a larger text file streams like a binary one
const MIN_COMPRESS_BYTES = 1024;          // smaller replies are not worth an encoding
// a local script or stylesheet reference inside the boot document (absolute, protocol and data URLs are left alone)
const ASSET_REF = /(\s(?:src|href)=")((?![a-z][a-z0-9+.-]*:|\/\/|\/|#)[^"?#\s]+\.(?:js|mjs|css))(?:\?[^"#]*)?(")/gi;

function acceptedEncodings(header) {
  const out = new Set();
  for (const part of String(header || '').split(',')) {
    const [name, ...params] = part.trim().toLowerCase().split(';');
    const q = params.map(p => p.trim()).find(p => p.startsWith('q='));
    if (name && !(q && Number(q.slice(2)) === 0)) out.add(name);
  }
  return out;
}
function matchesEtag(header, etag) {
  if (!header) return false;
  const bare = value => value.trim().replace(/^W\//, '');
  return String(header).split(',').some(tag => tag.trim() === '*' || bare(tag) === bare(etag));
}
function versionParam(url) {
  const query = String(url || '').split('?')[1];
  if (!query) return '';
  for (const pair of query.split('&')) {
    const [key, value] = pair.split('=');
    if (key === 'v') return value || '';
  }
  return '';
}

function makeStaticAssets(opts) {
  const root = path.resolve(opts.root);
  const mime = opts.mime || {};
  const release = String(opts.release || '').trim();
  const assetToken = String(opts.assetToken || '').trim();
  const maxCacheBytes = opts.maxCacheBytes || 64 * 1024 * 1024;
  const cache = new Map();   // abs -> { key, hash, data, br, gzip, bytes }
  let cachedBytes = 0;
  let tokenJob = null;

  function inside(abs) { return abs === root || abs.startsWith(root + path.sep); }
  async function fingerprint(dir, out) {
    await Promise.all((await fsp.readdir(dir, { withFileTypes: true })).map(async entry => {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) await fingerprint(abs, out);
      else if (entry.isFile()) {
        const stat = await fsp.stat(abs);
        out.push(path.relative(root, abs) + '\0' + stat.size + '\0' + stat.mtimeMs);
      }
    }));
    return out;
  }
  // One token per installed release. Any file that differs (even an in-place edit before a restart) changes it.
  function releaseToken() {
    if (assetToken) return Promise.resolve(assetToken);
    if (!release) return Promise.resolve('');
    if (!tokenJob) {
      tokenJob = fingerprint(root, []).then(list => crypto.createHash('sha256')
        .update(release + '\n' + list.sort().join('\n')).digest('base64url').slice(0, 12), () => '');
    }
    return tokenJob;
  }
  function forget(abs) {
    const old = cache.get(abs);
    if (old) { cachedBytes -= old.bytes; cache.delete(abs); }
  }
  function remember(abs, entry) {
    forget(abs);
    cache.set(abs, entry);
    cachedBytes += entry.bytes;
    for (const [key, old] of cache) {   // oldest first
      if (cachedBytes <= maxCacheBytes || key === abs) break;
      cachedBytes -= old.bytes; cache.delete(key);
    }
  }
  // The current content of a text file, its hash and any encodings made so far. Stat-checked on every call, so an
  // edited file (development) is picked up at once.
  async function textEntry(abs, stat) {
    const key = stat.size + ':' + stat.mtimeMs + ':' + stat.ino;
    const hit = cache.get(abs);
    if (hit && hit.key === key) { cache.delete(abs); cache.set(abs, hit); return hit; }   // keep recently used last
    const data = await fsp.readFile(abs);
    // br / gzip: undefined until made, null when that encoding would not be smaller; jobs: encodings in progress
    const entry = { key, data, hash: crypto.createHash('sha256').update(data).digest('base64url').slice(0, 16), br: undefined, gzip: undefined, jobs: {}, bytes: data.length };
    remember(abs, entry);
    return entry;
  }
  // One compression per file and encoding, shared by concurrent requests. A failure just sends the file as it is.
  function encoded(abs, entry, encoding) {
    if (entry[encoding] !== undefined) return Promise.resolve(entry[encoding]);
    if (!entry.jobs[encoding]) {
      const job = encoding === 'br'
        ? brotli(entry.data, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 6, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: entry.data.length } })
        : gzip(entry.data, { level: 6 });
      entry.jobs[encoding] = job.then(out => {
        const kept = out.length < entry.data.length ? out : null;
        entry[encoding] = kept;
        if (kept && cache.get(abs) === entry) { entry.bytes += kept.length; cachedBytes += kept.length; }
        return kept;
      }, () => { entry[encoding] = null; return null; });
    }
    return entry.jobs[encoding];
  }
  async function fileHash(abs) {
    let stat;
    try { stat = await fsp.stat(abs); } catch (_) { return ''; }
    if (!stat.isFile() || stat.size > MAX_TEXT_BYTES) return '';
    return (await textEntry(abs, stat)).hash;
  }
  async function versionAssets(html, dir) {
    const refs = new Map();
    for (const m of html.matchAll(ASSET_REF)) refs.set(m[2], '');
    await Promise.all([...refs.keys()].map(async ref => {
      let abs;
      try { abs = path.resolve(dir, decodeURIComponent(ref)); } catch (_) { return; }
      if (inside(abs)) refs.set(ref, await fileHash(abs).catch(() => ''));
    }));
    return html.replace(ASSET_REF, (whole, head, ref, tail) => {
      const hash = refs.get(ref);
      return hash ? head + ref + '?v=' + hash + tail : whole;
    });
  }

  function finish(req, res, status, headers, body) {
    res.writeHead(status, headers);
    if (req.method === 'HEAD' || status === 304 || !body) res.end();
    else res.end(body);
  }

  async function serve(req, res, hooks) {
    hooks = hooks || {};
    let abs;
    try {
      const url = decodeURIComponent(hooks.path != null ? String(hooks.path) : (req.url || '/').split('?')[0]);
      abs = path.resolve(root, url === '/' ? 'index.html' : url.replace(/^\/+/, ''));
    } catch (_) { res.writeHead(404); return res.end('not found'); }
    if (abs !== root && !abs.startsWith(root + path.sep)) { res.writeHead(403); return res.end('forbidden'); }
    try {
      const stat = await fsp.stat(abs);
      if (!stat.isFile()) throw new Error('not a file');
      const ext = path.extname(abs).toLowerCase();
      const type = mime[ext] || 'application/octet-stream';
      if (hooks.bootDocument && hooks.bootDocument(abs)) {
        let html = (await fsp.readFile(abs)).toString('utf8');
        html = await versionAssets(html, path.dirname(abs));
        const token = await releaseToken();
        const boot = (token ? '<script>window.__STARNET_ASSET_V__=' + JSON.stringify(token) + ';</script>' : '') +
          (hooks.bootScript ? hooks.bootScript() : '');
        if (boot) html = html.replace(/<\/head>/i, boot + '\n</head>');
        const body = Buffer.from(html, 'utf8');
        return finish(req, res, 200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Content-Length': body.length }, body);
      }
      const version = versionParam(req.url), token = version ? await releaseToken() : '';
      if (TEXT_EXTS.has(ext) && stat.size <= MAX_TEXT_BYTES) {
        const entry = await textEntry(abs, stat);
        const cacheControl = version && (version === entry.hash || version === token) ? IMMUTABLE : REVALIDATE;
        const accepts = acceptedEncodings(req.headers['accept-encoding']);
        let encoding = '', body = entry.data;
        if (entry.data.length >= MIN_COMPRESS_BYTES) {
          for (const candidate of ['br', 'gzip']) {
            if (!accepts.has(candidate)) continue;
            const out = await encoded(abs, entry, candidate);
            if (out) { encoding = candidate; body = out; }
            break;
          }
        }
        const etag = '"' + entry.hash + (encoding ? '-' + encoding : '') + '"';
        const headers = { 'Content-Type': type, 'Cache-Control': cacheControl, 'ETag': etag, 'Vary': 'Accept-Encoding' };
        if (matchesEtag(req.headers['if-none-match'], etag)) return finish(req, res, 304, headers);
        if (encoding) headers['Content-Encoding'] = encoding;
        headers['Content-Length'] = body.length;
        return finish(req, res, 200, headers, body);
      }
      const etag = 'W/"' + stat.size.toString(36) + '-' + Math.floor(stat.mtimeMs).toString(36) + '"';
      const headers = { 'Content-Type': type, 'Cache-Control': version && version === token ? IMMUTABLE : REVALIDATE, 'ETag': etag };
      if (matchesEtag(req.headers['if-none-match'], etag)) return finish(req, res, 304, headers);
      headers['Content-Length'] = stat.size;
      res.writeHead(200, headers);
      if (req.method === 'HEAD') return res.end();
      await new Promise(resolve => {
        const stream = fs.createReadStream(abs);
        stream.once('error', () => { res.destroy(); resolve(); });
        res.once('close', () => { stream.destroy(); resolve(); });
        stream.pipe(res);
      });
    } catch (_) {
      if (!res.headersSent) { res.writeHead(404); res.end('not found'); }
      else res.destroy();
    }
  }

  return { serve, versionAssets, releaseToken, stats: () => ({ files: cache.size, bytes: cachedBytes }) };
}

module.exports = { makeStaticAssets, acceptedEncodings, matchesEtag, versionParam, IMMUTABLE, REVALIDATE };
