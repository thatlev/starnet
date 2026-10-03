'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const core = require('../frontend/app/stationconfig-core');
const wm = require('../frontend/app/worldmodel');
const { makeStationConfig } = require('../sidecar/station-config');
const viewerId = 'viewer-123456789012345', clientId = 'client-123456789012345';
function initial() { return { starnetConfig: 1, settings: { theme: 'amber', sound: true, notifyPrefs: { sound: true } }, layout: wm.create(wm.starterDoc()).serialize() }; }
function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'starnet-config-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let state = initial(), applyCount = 0, service;
  const seen = [];
  service = makeStationConfig({ root, timeoutMs: 60, ...options, emit(name, msg) {
    seen.push(msg);
    if (options.silent) return;
    queueMicrotask(() => {
      assert.equal(name, 'station.command');
      assert.equal(service.claim(msg.id, viewerId, clientId), true);
      assert.equal(service.claim(msg.id, viewerId, 'another-client-1234567'), false);
      if (msg.verb === 'config.apply') {
        // The previous snapshot has already reached durable disk when a mutation is emitted.
        const journal = JSON.parse(fs.readFileSync(path.join(root, '.station-config/history.json')));
        assert.equal(journal.entries.at(-1).status, 'prepared');
        assert.deepEqual(journal.entries.at(-1).before, state);
        applyCount++;
        if (options.failApply) return service.ack(msg.id, viewerId, { clientId, ok: false, error: 'save failed' });
        state = core.clone(msg.args.after);
      }
      const result = msg.verb === 'config.validate' ? msg.args.after : state;
      assert.equal(service.ack(msg.id, viewerId, { clientId: 'wrong-client-1234567', ok: true, result }), false);
      service.ack(msg.id, viewerId, { clientId, ok: true, result });
    });
  } });
  return { service, root, seen, state: () => state, mutate: fn => fn(state), applied: () => applyCount };
}
test('validated partial settings preserve other settings; prototype and unbounded layouts are refused', () => {
  const doc = initial();
  assert.equal(core.merge(doc, { starnetConfig: 1, settings: { sound: false } }).settings.theme, 'amber');
  for (const settings of [{ apiKey: 'dummy' }, { theme: '<script>' }, { textScale: 999 }, { sound: 'false' }]) assert.throws(() => core.merge(doc, { starnetConfig: 1, settings }));
  assert.throws(() => core.validate(JSON.parse('{"starnetConfig":1,"settings":{"__proto__":{}}}'), true));
  const huge = core.clone(doc); huge.layout.rooms.r1.rects[0].x2 = 9999;
  assert.throws(() => core.validate(huge), /240-tile/);
  const future = core.clone(doc); future.layout.version = 2;
  assert.throws(() => core.validate(future), /version 1/);
});
test('apply is backed up first, history persists, and restore makes another recovery point', async t => {
  const f = fixture(t);
  const read = await f.service.execute({ action: 'get' });
  const changed = await f.service.execute({ ...read, action: 'apply', config: { starnetConfig: 1, settings: { theme: 'blue' } } });
  assert.equal(changed.applied, true); assert.equal(f.state().settings.theme, 'blue');
  const entries = (await f.service.execute({ action: 'history' })).entries;
  assert.equal(entries.length, 1); assert.deepEqual(entries[0].changes, ['settings.theme']); assert.equal(entries[0].status, 'applied');
  const restarted = makeStationConfig({ root: f.root, emit() {} });
  assert.deepEqual((await restarted.execute({ action: 'history' })).entries, entries);
  const restored = await f.service.execute({ ...changed, action: 'restore', id: changed.backupId });
  assert.equal(restored.config.settings.theme, 'amber'); assert.equal(f.applied(), 2);
  assert.equal(fs.statSync(path.join(f.root, '.station-config/history.json')).mode & 0o777, 0o600);
});
test('stale reads and previews do not mutate or create backups', async t => {
  const f = fixture(t);
  const read = await f.service.execute({ action: 'get' });
  const preview = await f.service.execute({ ...read, action: 'preview', config: { starnetConfig: 1, settings: { sound: false } } });
  assert.equal(preview.applied, false); assert.equal(f.applied(), 0);
  f.mutate(s => { s.settings.theme = 'green'; });
  await assert.rejects(f.service.execute({ ...read, action: 'apply', config: read.config }), /changed since/);
  assert.equal((await f.service.execute({ action: 'history' })).entries.length, 0);
});
test('backup failure prevents application; failed application retains a recovery snapshot', async t => {
  const f = fixture(t, { write() { throw new Error('disk full'); } });
  const read = await f.service.execute({ action: 'get' });
  await assert.rejects(f.service.execute({ ...read, action: 'apply', config: { starnetConfig: 1, settings: { sound: false } } }), /disk full/);
  assert.equal(f.applied(), 0);
  const failed = fixture(t, { failApply: true });
  const current = await failed.service.execute({ action: 'get' });
  await assert.rejects(failed.service.execute({ ...current, action: 'apply', config: { starnetConfig: 1, settings: { sound: false } } }), /backup .* retained/);
  assert.equal((await failed.service.execute({ action: 'history' })).entries[0].status, 'unconfirmed');
});
test('model config writes remain consent gated and only the executing run may be active', async t => {
  const registered = [];
  require('../sidecar/tools/builtin/station-config').registerStationConfigTools({ register: t => registered.push(t) }, { execute: async () => ({}) });
  assert.equal(registered.find(t => t.name === 'station.config.apply').requiresConsent, true);
  const f = fixture(t, { canEdit: id => id === 'initiator' });
  const read = await f.service.execute({ action: 'get' });
  const input = { ...read, action: 'apply', config: { starnetConfig: 1, settings: { sound: false } }, actorRunId: 'initiator' };
  await assert.rejects(f.service.execute(input), /active work/); // caller JSON cannot mint run authority
  assert.equal((await f.service.execute(input, { runId: 'initiator' })).applied, true);
});
