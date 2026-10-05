'use strict';
// node --test test/open-external.test.js — U.openExternal (sign-in pages reach the Mac browser in every shell) and
// U.assetUrl (release-pinned image URLs).
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
