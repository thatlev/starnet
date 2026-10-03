'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const core = require('../frontend/app/stationconfig-core');
const { readJsonResilient, writeJsonResilient } = require('./durable-store');

// Configuration commands are never replayed. One viewer claims each command; apply is pinned to
// the viewer that supplied the read/preview. Settings are viewer-local, layouts use the station save.
function makeStationConfig({ root, emit, canEdit = () => true, now = Date.now, timeoutMs = 15000, write = writeJsonResilient }) {
  const dir = path.join(root, '.station-config');
  const file = path.join(dir, 'history.json');
  const pending = new Map();
  let queue = Promise.resolve();
  const digest = value => crypto.createHash('sha256').update(core.canonical(value)).digest('hex');
  function history() {
    const r = readJsonResilient({ fs }, file);
    if (r.status === 'absent') return [];
    if (!r.value || r.value.version !== 1 || !Array.isArray(r.value.entries)) throw new Error('Configuration history needs recovery; no changes were made');
    return r.value.entries;
  }
  function save(entries) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.chmodSync(dir, 0o700);
    write({ fs, path }, file, { version: 1, entries });
    fs.chmodSync(file, 0o600);
    if (fs.existsSync(file + '.bak')) fs.chmodSync(file + '.bak', 0o600);
  }
  function request(verb, args = {}, viewerId, clientId) {
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('The station did not confirm this operation. Open StarNet, then read configuration before retrying.'));
      }, timeoutMs);
      timer.unref?.();
      pending.set(id, { viewerId: viewerId || null, clientId: clientId || null, claimed: null, resolve, reject, timer });
      try { emit('station.command', { id, verb: 'config.' + verb, args: { ...args, viewerId: viewerId || null, clientId: clientId || null } }); }
      catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
    });
  }
  function claim(id, viewerId, clientId) {
    const p = pending.get(id);
    if (!p || typeof viewerId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(viewerId) || !/^[a-zA-Z0-9-]{16,80}$/.test(clientId || '') ||
      p.claimed || (p.viewerId && p.viewerId !== viewerId) || (p.clientId && p.clientId !== clientId)) return false;
    p.claimed = { viewerId, clientId }; return true;
  }
  function ack(id, viewerId, outcome) {
    const p = pending.get(id);
    if (!p || p.claimed?.viewerId !== viewerId || p.claimed?.clientId !== outcome.clientId) return false;
    clearTimeout(p.timer); pending.delete(id);
    if (outcome.ok) p.resolve({ viewerId, clientId: outcome.clientId, result: outcome.result });
    else p.reject(new Error(String(outcome.error || 'Configuration was refused').slice(0, 500)));
    return true;
  }
  const publicEntry = e => ({ id: e.id, at: e.at, label: e.label, status: e.status, changes: e.changes, viewerId: e.viewerId });
  async function capture(viewerId, clientId) {
    const out = await request('capture', {}, viewerId, clientId);
    const config = core.validate(out.result);
    return { viewerId: out.viewerId, clientId: out.clientId, revision: digest(config), config };
  }
  async function execute(input = {}, actorRunId) {
    if (input.action === 'history') return { entries: history().slice().reverse().map(publicEntry) };
    if (!input.action || input.action === 'get') return capture(input.viewerId, input.clientId);
    if (!['apply', 'restore', 'preview'].includes(input.action)) throw new Error('Unknown configuration action');
    if (!canEdit(actorRunId)) throw new Error('Wait for active work to finish and resolve any storage recovery warning before editing configuration');
    if (typeof input.viewerId !== 'string' || !/^[a-f0-9]{64}$/.test(String(input.revision || ''))) throw new Error('Read configuration first; viewerId and revision are required');
    const current = await capture(input.viewerId, input.clientId);
    if (current.revision !== input.revision) throw new Error('Configuration changed since your read. Read it again and reapply your edits.');
    let patch = input.config;
    const entries = history();
    if (input.action === 'restore') {
      const previous = entries.find(e => e.id === input.id && e.viewerId === input.viewerId);
      if (!previous) throw new Error('Backup not found for this viewer');
      patch = previous.before;
    }
    const candidate = core.merge(current.config, patch);
    // Viewer owns the prop catalog and mount rules. Preflight uses a disposable WorldModel.
    const checked = await request('validate', { before: current.config, after: candidate, actorRunId }, current.viewerId, current.clientId);
    const after = core.validate(checked.result);
    const changed = core.changes(current.config, after);
    if (input.action === 'preview' || !changed.length) return { ...current, config: after, changes: changed, applied: false };
    const entry = { id: crypto.randomUUID(), at: now(), viewerId: current.viewerId,
      label: String(input.label || (input.action === 'restore' ? 'Restore configuration' : 'Configuration edit')).slice(0, 120),
      changes: changed, status: 'prepared', before: current.config, after };
    entries.push(entry);
    // Save before asking the page to change anything. Never trade a failed backup for an unprotected edit.
    save(entries);
    try {
      if (!canEdit(actorRunId)) throw new Error('Station started work while preparing the edit; try again when idle');
      const applied = await request('apply', { before: current.config, after, actorRunId }, current.viewerId, current.clientId);
      const actual = core.validate(applied.result);
      if (digest(actual) !== digest(after)) throw new Error('Read-back differed from the approved configuration');
      entry.status = 'applied';
      save(entries.slice(-30));
      return { viewerId: current.viewerId, clientId: current.clientId, revision: digest(actual), config: actual, changes: changed, applied: true, backupId: entry.id };
    } catch (error) {
      entry.status = 'unconfirmed';
      try { save(entries); } catch (_) { /* prepared snapshot remains recoverable */ }
      throw new Error('Change could not be confirmed; backup ' + entry.id + ' is retained. ' + error.message);
    }
  }
  return {
    claim, ack,
    execute(input, context = {}) {
      const result = queue.then(() => execute(input, context.runId));
      queue = result.catch(() => {});
      return result;
    }
  };
}
module.exports = { makeStationConfig };
