'use strict';
// Optional browser acceptance: NODE_PATH=<playwright installation> node --test test/station-config.browser.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { once } = require('node:events');
const { chromium } = require('playwright');
const { freePort } = require('../remote/cli');
const wm = require('../frontend/app/worldmodel');
const ROOT = path.resolve(__dirname, '..');
test('real viewer applies settings and a room edit, rejects invalid/stale edits and restores after reload', { timeout: 120000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'starnet-config-browser-'));
  const port = await freePort(), base = 'http://127.0.0.1:' + port, token = crypto.randomBytes(32).toString('hex');
  const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'dev/fixtures/seed-workspace/agent.save.json')));
  seed.doc.version = 6; seed.doc.updatedAt = Date.now(); seed.updatedAt = seed.doc.updatedAt; seed.savedAt = seed.updatedAt;
  seed.doc.station = wm.create(wm.starterDoc()).serialize();
  fs.writeFileSync(path.join(root, 'agent.save.json'), JSON.stringify(seed));
  const child = spawn(process.execPath, ['sidecar/index.js'], { cwd: ROOT, env: {
    PATH: process.env.PATH, HOME: root, TMPDIR: os.tmpdir(), NODE_PATH: process.env.NODE_PATH,
    STARNET_WORKSPACES: root, STARNET_PORT: String(port), STARNET_API_TOKEN: token,
    STARNET_DEV: '1', STARNET_REMOTE: '1', STARNET_DEFAULT_MODEL: 'test/model',
    SKYNET_THREAD_MINE: '0', SKYNET_SKILL_REVIEW: '0', SKYNET_SKILL_CURATOR: '0', SKYNET_SCOUT: '0', SKYNET_ENV_DISCOVERY: '0', SKYNET_QUEST_REFRESH: '0'
  }, stdio: 'ignore' });
  let browser;
  t.after(async () => { await browser?.close(); if (child.exitCode === null) { child.kill('SIGTERM'); await once(child, 'exit'); } fs.rmSync(root, { recursive: true, force: true }); });
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error('Fixture runtime failed to start');
    try { if ((await fetch(base + '/api/health')).ok) break; } catch (_) {}
    await new Promise(r => setTimeout(r, 100));
  }
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof App !== 'undefined' && App.stationLayout && App.stationLayout(), { timeout: 30000 });
  await page.waitForFunction(() => typeof World !== 'undefined' && World.linkState && !World.linkState().down);
  const tip = page.getByRole('button', { name: /GOT IT/ });
  if (await tip.count()) await tip.first().click();
  const headers = { 'Content-Type': 'application/json', 'X-StarNet-Token': token };
  const request = async body => {
    const res = await fetch(base + '/api/station-config/request', { method: 'POST', headers, body: JSON.stringify(body) });
    const out = await res.json(); return { ...out, httpStatus: res.status };
  };
  assert.equal((await fetch(base + '/api/station-config/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  const read = await request({ action: 'get' });
  assert.equal(read.httpStatus, 200, read.error);
  const tokenFile = path.join(root, 'test-token'), exportFile = path.join(root, 'config-export.json');
  fs.writeFileSync(tokenFile, token, { mode: 0o600 });
  // External agents normally run with Codex/Terminal in front of the Mac app. Native discovery
  // must still answer while WebKit marks its window hidden; targeting stays pinned to one page.
  await page.evaluate(() => {
    window.__STARNET_NATIVE__ = true;
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
  });
  await promisify(execFile)(process.execPath, ['scripts/station-config.mjs', 'get', '--url', base, '--token-file', tokenFile, '--out', exportFile], { cwd: ROOT });
  await page.evaluate(() => { delete document.hidden; delete window.__STARNET_NATIVE__; });
  const exported = JSON.parse(fs.readFileSync(exportFile));
  assert.equal(exported.viewerId, read.viewerId);
  assert.equal(JSON.stringify(exported).includes(token), false);
  assert.equal(fs.statSync(exportFile).mode & 0o777, 0o600);
  const after = JSON.parse(JSON.stringify(read.config)); after.settings.theme = 'blue'; after.settings.roomLighting = 'medium';
  const expanded = wm.deserialize(after.layout);
  assert.equal(expanded.addRoom({ kind: 'lab', rect: { x1: 20, y1: 0, x2: 28, y2: 8 } }).ok, true);
  after.layout = expanded.serialize();
  after.layout.rooms[after.layout.order[0]].name = 'CONFIG TEST';
  const apply = await request({ ...read, action: 'apply', config: after });
  assert.equal(apply.httpStatus, 200, apply.error); assert.equal(apply.applied, true);
  assert.equal(await page.evaluate(() => document.body.classList.contains('theme-blue')), true);
  assert.equal(await page.evaluate(() => App.stationLayout().rooms[App.stationLayout().order[0]].name), 'CONFIG TEST');
  assert.equal(apply.config.layout.order.length, read.config.layout.order.length + 1);
  const stale = await request({ ...read, action: 'apply', config: read.config }); assert.equal(stale.httpStatus, 409);
  const invalid = JSON.parse(JSON.stringify(after)); invalid.layout.rooms[invalid.layout.order[0]].rects[0].x2 = 9999;
  assert.equal((await request({ ...apply, action: 'apply', config: invalid })).httpStatus, 409);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof App !== 'undefined' && App.stationLayout?.());
  await page.waitForFunction(() => typeof World !== 'undefined' && !World.linkState().down);
  const reopened = await request({ action: 'get' });
  assert.equal(reopened.viewerId, read.viewerId); assert.notEqual(reopened.clientId, read.clientId);
  assert.equal(reopened.config.settings.theme, 'blue');
  const restore = await request({ ...reopened, action: 'restore', id: apply.backupId });
  assert.equal(restore.httpStatus, 200, restore.error); assert.equal(restore.config.settings.theme, read.config.settings.theme);
  assert.equal(restore.config.layout.rooms[after.layout.order[0]].name, read.config.layout.rooms[after.layout.order[0]].name);
  await page.evaluate(() => StationUI.openTerm('settings'));
  await page.getByRole('tab', { name: 'CONFIGURATION' }).click();
  await page.waitForFunction(() => document.querySelector('#station-config-message')?.textContent === 'Loaded current configuration.');
  assert.equal(await page.locator('.config-history-row').count(), 2);
  const uiConfig = JSON.parse(await page.locator('#station-config-json').inputValue());
  uiConfig.settings.theme = 'green';
  await page.locator('#station-config-json').fill(JSON.stringify(uiConfig, null, 2));
  await page.getByRole('button', { name: 'APPLY CHANGES', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#station-config-message')?.textContent === 'Applied and backed up.');
  await page.getByRole('tab', { name: 'APPEARANCE', exact: true }).click();
  assert.equal(await page.locator('[data-t="green"]').getAttribute('aria-pressed'), 'true');
  await page.getByRole('tab', { name: 'CONFIGURATION', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#station-config-message')?.textContent === 'Loaded current configuration.');
  await page.getByRole('button', { name: 'RESTORE BEFORE', exact: true }).first().click();
  await page.waitForFunction(() => document.querySelector('#station-config-message')?.textContent?.startsWith('Restored.'));
  assert.equal(await page.evaluate(() => StationUI.getTheme()), read.config.settings.theme);
  for (const width of [1360, 720, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(250);
    await page.locator('#station-config-json').scrollIntoViewIfNeeded();
    const visibleEditor = await page.locator('#station-config-json').evaluate(el => {
      const r = el.getBoundingClientRect(), pane = el.closest('.con-pane').getBoundingClientRect();
      return pane.height > 100 && r.top < pane.bottom && r.bottom > pane.top;
    });
    assert.equal(visibleEditor, true, 'the editor remains reachable at ' + width);
    const overflow = await page.locator('.config-pane').evaluate(el => ({ client: el.clientWidth, scroll: el.scrollWidth,
      children: Array.from(el.querySelectorAll('*')).map(c => ({ tag: c.tagName, class: c.className, width: c.getBoundingClientRect().width,
        right: c.getBoundingClientRect().right - el.getBoundingClientRect().right })).filter(c => c.right > .1) }));
    // CSS body zoom can round scrollWidth a couple of CSS pixels beyond clientWidth even when
    // every actual bound fits. Measure the rendered controls instead of masking the panel overflow.
    assert.deepEqual(overflow.children, [], 'config controls overflow at ' + width + ': ' + JSON.stringify(overflow));
    if (process.env.STARNET_CONFIG_SCREENSHOTS) {
      fs.mkdirSync(process.env.STARNET_CONFIG_SCREENSHOTS, { recursive: true });
      await page.screenshot({ path: path.join(process.env.STARNET_CONFIG_SCREENSHOTS, 'config-' + width + '.png') });
    }
  }
  assert.deepEqual(errors, []);
});
