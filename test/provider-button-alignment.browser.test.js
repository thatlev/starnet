'use strict';
// Optional browser regression: NODE_PATH=<playwright installation> node --test test/provider-button-alignment.browser.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { chromium } = require('playwright');
const { freePort } = require('../remote/cli');
const wm = require('../frontend/app/worldmodel');
const ROOT = path.resolve(__dirname, '..');

test('provider actions share edges, padding and focus clearance at narrow/wide sizes and enlarged text', { timeout: 90000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'starnet-provider-alignment-'));
  const port = await freePort(), base = 'http://127.0.0.1:' + port;
  const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'dev/fixtures/seed-workspace/agent.save.json')));
  seed.doc.version = 6; seed.doc.updatedAt = Date.now(); seed.updatedAt = seed.doc.updatedAt; seed.savedAt = seed.updatedAt;
  seed.doc.station = wm.create(wm.starterDoc()).serialize();
  fs.writeFileSync(path.join(root, 'agent.save.json'), JSON.stringify(seed));
  const child = spawn(process.execPath, ['sidecar/index.js'], { cwd: ROOT, env: {
    PATH: process.env.PATH, HOME: root, TMPDIR: os.tmpdir(), NODE_PATH: process.env.NODE_PATH,
    STARNET_WORKSPACES: root, STARNET_PORT: String(port), STARNET_API_TOKEN: crypto.randomBytes(32).toString('hex'),
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(10000);
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== base) return route.abort();
    if (url.pathname === '/api/credits') return route.fulfill({ json: { configured: false } });
    if (url.pathname === '/api/credits/linkable') return route.fulfill({ json: { available: true } });
    return route.continue();
  });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof App !== 'undefined' && App.stationLayout?.());
  await page.evaluate(() => StationUI.openTerm('settings'));
  await page.getByRole('dialog', { name: 'SETTINGS', exact: true }).getByRole('button', { name: 'Maximize window', exact: true }).click();
  await page.getByRole('tab', { name: 'PROVIDERS', exact: true }).click();
  const list = page.locator('.con-sec:not(.con-sec-hidden) .prov-list').first();
  await list.waitFor({ state: 'visible' });
  await list.locator('[data-provider="starnet"] > .prov-addkey').waitFor({ state: 'visible' });
  for (const zoom of [1, 1.5, 2]) for (const width of [279, 354, 417, 480, 481, 640]) {
    await page.evaluate(z => { document.body.style.zoom = String(z); }, zoom);
    await list.evaluate((el, w) => { el.style.width = w + 'px'; el.style.maxWidth = 'none'; }, width);
    const rows = await list.locator('.prov-card').evaluateAll(cards => cards.filter(c => c.querySelector('.prov-addkey')).map(c => {
      const b = c.querySelector('.prov-addkey'), s = c.querySelector('.prov-stat');
      const cr = c.getBoundingClientRect(), br = b.getBoundingClientRect(), sr = s.getBoundingClientRect();
      const style = getComputedStyle(b);
      return { id: c.dataset.provider, left: br.left, right: br.right, height: br.height,
        statusLeft: sr.left, below: sr.top >= br.bottom,
        paddingLeft: parseFloat(style.paddingLeft), paddingRight: parseFloat(style.paddingRight),
        contained: br.left - cr.left >= 5 && cr.right - br.right >= 5,
        overflow: b.scrollWidth > b.clientWidth + 1 };
    }));
    assert.ok(rows.some(r => r.id === 'starnet') && rows.some(r => r.id === 'openrouter') && rows.some(r => r.id === 'codex'), 'expected provider actions, got ' + rows.map(r => r.id).join(', '));
    for (const r of rows) {
      const label = `${r.id}, ${width}px, ${zoom}x`;
      assert.ok(Math.abs(r.left - rows[0].left) < .5 && Math.abs(r.right - rows[0].right) < .5, 'shared button edges: ' + label);
      assert.equal(r.paddingLeft, r.paddingRight, 'balanced inner padding: ' + label);
      assert.ok(r.height >= 36 * zoom && r.contained && !r.overflow, 'button and focus ring fit: ' + label);
      assert.ok(r.below, 'status remains below the action: ' + label);
      if (width <= 480) assert.ok(Math.abs(r.statusLeft - r.left) < .5, 'shared status edge: ' + label);
    }
  }
  await page.evaluate(() => { document.body.style.zoom = '1'; });
  await list.evaluate(el => { el.style.width = '354px'; });
  const add = list.locator('[data-provider="openrouter"] > .prov-addkey');
  await list.locator('[data-provider="openrouter"] > .prov-select').focus();
  await page.keyboard.press('Tab');
  assert.equal(await add.evaluate(el => el === document.activeElement), true, 'the action is keyboard reachable');
  assert.equal(await add.evaluate(el => el.matches(':focus-visible')), true);
  await add.click();
  assert.equal(await page.locator('#prov-key-edit-openrouter').isVisible(), true, 'the existing editor still opens');
  await add.click();
  assert.equal(await page.locator('#prov-key-edit-openrouter').isVisible(), false, 'the existing editor still closes');
  if (process.env.STARNET_PROVIDER_SCREENSHOT) {
    await list.locator('.prov-card[data-provider="starnet"]').scrollIntoViewIfNeeded();
    const first = await list.locator('.prov-card').first().boundingBox();
    const third = await list.locator('.prov-card').nth(2).boundingBox();
    await page.screenshot({ path: process.env.STARNET_PROVIDER_SCREENSHOT,
      clip: { x: first.x - 8, y: first.y - 8, width: first.width + 16, height: third.y + third.height - first.y + 16 } });
  }
});
