'use strict';
// node --test test/open-external.test.js — U.openExternal (sign-in pages reach the Mac browser in every shell) and
// U.assetUrl (release-pinned image URLs) and the image slots that keep art from queueing the station API behind it.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'js', 'util.js'), 'utf8');
function load(window) {
  const context = { window, console };
  vm.runInNewContext(source + '\n;this.U = U;', context);
  return context.U;
}
const plain = value => JSON.parse(JSON.stringify(value));   // results come from the page's realm
const LINK = 'https://claude.com/cai/oauth/authorize?code=true&state=a b';

test('the local desktop app opens links through the native command and reports failures', async () => {
  const calls = [];
  let fail = false;
  const window = { __TAURI__: { core: { invoke: (cmd, args) => { calls.push([cmd, args]); return fail ? Promise.reject(new Error('no')) : Promise.resolve(); } } },
    open: () => { throw new Error('window.open must not be used in the desktop app'); } };
  const U = load(window);
  assert.deepEqual(plain(await U.openExternal(LINK)), { opened: true, where: 'browser', win: null });
  assert.deepEqual(plain(calls), [['open_external_url', { url: LINK }]]);
  fail = true;
  assert.deepEqual(plain(await U.openExternal(LINK)), { opened: false, where: 'browser', win: null });
});

test('the remote desktop window opens links through the starnet-connect navigation, even outside a click', async () => {
  const window = { __STARNET_NATIVE__: true, __STARNET_OPEN_EXTERNAL__: true, location: { href: 'http://127.0.0.1:8790/' }, open: () => { throw new Error('blocked'); } };
  const U = load(window);
  const result = await U.openExternal('  ' + LINK + ' ');
  assert.deepEqual(plain(result), { opened: true, where: 'browser', win: null });
  assert.equal(window.location.href, 'starnet-connect://open-external?url=' + encodeURIComponent(LINK));
  assert.equal(new URL(window.location.href).searchParams.get('url'), LINK, 'the native side decodes the exact link');
});

test('an older remote app without the open-external route keeps using window.open', async () => {
  const opened = [];
  const window = { __STARNET_NATIVE__: true, location: { href: 'http://127.0.0.1:8790/' }, open: url => { opened.push(url); return {}; } };
  const U = load(window);
  assert.equal((await U.openExternal(LINK)).where, 'popup');
  assert.deepEqual(opened, [LINK]);
  assert.equal(window.location.href, 'http://127.0.0.1:8790/');
});

test('a plain browser opens a tab without an opener and reports a blocked popup', async () => {
  const opened = [];
  let block = false;
  const window = { open: (url, name, features) => { opened.push([url, name, features]); return block ? null : { opener: 'page' }; } };
  const U = load(window);
  const tab = await U.openExternal(LINK);
  assert.equal(tab.opened, true); assert.equal(tab.where, 'popup'); assert.equal(tab.win.opener, null);
  assert.deepEqual(opened[0], [LINK, '_blank', '']);
  const popup = await U.openExternal(LINK, { name: 'starnet_oauth', features: 'width=540,height=720' });
  assert.deepEqual(opened[1], [LINK, 'starnet_oauth', 'width=540,height=720']);
  assert.equal(popup.opened, true);
  block = true;
  assert.deepEqual(plain(await U.openExternal(LINK)), { opened: false, where: 'popup', win: null });
});

test('only web links open', async () => {
  const touched = [];
  const window = { __STARNET_NATIVE__: true, __STARNET_OPEN_EXTERNAL__: true, location: { set href(v) { touched.push(v); } }, open: () => touched.push('open') };
  const U = load(window);
  for (const bad of ['', null, 'javascript:alert(1)', 'file:///etc/passwd', 'starnet-connect://setup', '/relative']) {
    assert.equal((await U.openExternal(bad)).opened, false, String(bad));
  }
  assert.deepEqual(touched, []);
});

test('asset URLs carry the release token only on an installed station', () => {
  assert.equal(load({}).assetUrl('assets/industrial/floor.png'), 'assets/industrial/floor.png');
  const U = load({ __STARNET_ASSET_V__: 'Ab-c_123' });
  assert.equal(U.assetUrl('assets/industrial/floor.png'), 'assets/industrial/floor.png?v=Ab-c_123');
  assert.equal(U.assetUrl('assets/x.png?v=1'), 'assets/x.png?v=1');
  assert.equal(U.assetUrl('app/app.js'), 'app/app.js');
  assert.equal(U.assetUrl('https://example.com/assets/x.png'), 'https://example.com/assets/x.png');
  assert.equal(U.assetUrl(null), null);
});

test('station images load at most three at a time and always free their slot', () => {
  const timers = [];
  const context = { window: { __STARNET_ASSET_V__: 'v1' }, console, setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout: id => { if (timers[id - 1]) timers[id - 1].cleared = true; } };
  vm.runInNewContext(source + '\n;this.U = U;', context);
  const U = context.U;
  const images = Array.from({ length: 6 }, () => {
    const listeners = {};
    const img = { srcSet: null, addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
      removeEventListener: (ev, fn) => { listeners[ev] = (listeners[ev] || []).filter(f => f !== fn); },
      fire: ev => { for (const fn of (listeners[ev] || []).slice()) fn(); }, listeners };
    Object.defineProperty(img, 'src', { set(v) { img.srcSet = v; }, get() { return img.srcSet; } });
    return img;
  });
  images.forEach((img, i) => U.setAssetImage(img, 'assets/industrial/t' + i + '.png'));
  assert.deepEqual(images.map(img => img.srcSet), ['assets/industrial/t0.png?v=v1', 'assets/industrial/t1.png?v=v1', 'assets/industrial/t2.png?v=v1', null, null, null]);
  images[1].fire('load');
  assert.equal(images[3].srcSet, 'assets/industrial/t3.png?v=v1', 'a loaded image hands its slot to the next');
  images[1].fire('load');
  assert.equal(images[4].srcSet, null, 'a slot is released once');
  images[0].fire('error');
  assert.equal(images[4].srcSet, 'assets/industrial/t4.png?v=v1', 'a failed image frees its slot too');
  const stalled = timers[2];
  assert.equal(stalled.ms, 60000);
  stalled.fn();
  assert.equal(images[5].srcSet, 'assets/industrial/t5.png?v=v1', 'a stalled image frees its slot after a minute');
  assert.equal(timers[1].cleared, true, 'a finished image cancels its watchdog');
  assert.deepEqual(Object.values(images[1].listeners).flat(), [], 'listeners are removed after release');
});
