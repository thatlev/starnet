'use strict';
/* sidecar/autopilot-rails.js — READ-ONLY view of an external production pipeline's runs, for the RAILS panel.

   A content factory outside StarNet (Lev's Kedr autopilot) writes one manifest per video at
   <root>/runs/<run-id>/run.json. This module reads the newest manifests and normalizes them into rails:
   one rail per video, one stop per pipeline step, grouped by channel (a channel is shown as its own room).

   Truthful by construction: it only reports what a manifest says. A missing, unreadable or oversized manifest
   becomes an `errors` row, never an invented step. Nothing here writes, executes or follows symlinks.

   Accepted run.json shapes (tolerant, because the factory is built separately):
     { id|run_id, channel|account, title|headline|slug, status, created_at|createdAt, updated_at|updatedAt,
       steps: [ { name|id|step, status|state, started_at|startedAt, finished_at|ended_at|endedAt, note|message|error } ]
           | { <name>: { status, ... } | "<status>" } } */

const MAX_RUNS = 40;
const MAX_BYTES = 512 * 1024;
const RUN_ID_RE = /^[A-Za-z0-9._-]{1,120}$/;

const STATUS = {
  pending: 'pending', queued: 'pending', waiting: 'pending', todo: 'pending', new: 'pending', planned: 'pending',
  running: 'running', in_progress: 'running', 'in-progress': 'running', active: 'running', started: 'running', working: 'running',
  done: 'done', ok: 'done', success: 'done', succeeded: 'done', passed: 'done', complete: 'done', completed: 'done', made: 'done', ready: 'done',
  failed: 'failed', error: 'failed', errored: 'failed', crashed: 'failed', blocked: 'failed',
  skipped: 'skipped', skip: 'skipped', 'n/a': 'skipped',
  needs_approval: 'review', awaiting_approval: 'review', review: 'review', approval: 'review', needs_review: 'review',
  approved: 'done', scheduled: 'done', posted: 'done', cancelled: 'skipped', canceled: 'skipped'
};

function normStatus(value) {
  const key = String(value == null ? '' : value).trim().toLowerCase().replace(/\s+/g, '_');
  return STATUS[key] || (key ? 'unknown' : 'pending');
}
function str(value, max) {
  if (value == null) return '';
  return String(value).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').trim().slice(0, max || 200);
}
function time(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value < 1e12 ? Math.round(value * 1000) : Math.round(value);
  const t = Date.parse(String(value));
  return Number.isFinite(t) ? t : null;
}
function first(obj, keys) {
  for (const k of keys) if (obj && obj[k] != null && obj[k] !== '') return obj[k];
  return undefined;
}

function normStep(raw, fallbackName) {
  const rec = (raw && typeof raw === 'object') ? raw : { status: raw };
  return {
    name: str(first(rec, ['name', 'id', 'step', 'label']) || fallbackName || 'step', 60),
    status: normStatus(first(rec, ['status', 'state'])),
    startedAt: time(first(rec, ['started_at', 'startedAt', 'start'])),
    endedAt: time(first(rec, ['finished_at', 'ended_at', 'endedAt', 'finishedAt', 'end'])),
    note: str(first(rec, ['note', 'message', 'error', 'detail', 'summary']), 240)
  };
}

function normSteps(steps) {
  if (Array.isArray(steps)) return steps.slice(0, 40).map((s, i) => normStep(s, 'step ' + (i + 1)));
  if (steps && typeof steps === 'object') return Object.keys(steps).slice(0, 40).map(k => normStep(steps[k], k));
  return [];
}

// The rail's overall state: an explicit manifest status wins; otherwise derive it from the steps.
function overall(explicit, steps) {
  if (explicit) return normStatus(explicit);
  if (steps.some(s => s.status === 'failed')) return 'failed';
  if (steps.some(s => s.status === 'running')) return 'running';
  if (steps.some(s => s.status === 'review')) return 'review';
  if (steps.length && steps.every(s => s.status === 'done' || s.status === 'skipped')) return 'done';
  return 'pending';
}

function normRun(doc, dirName, mtimeMs) {
  const steps = normSteps(doc.steps);
  const explicit = first(doc, ['status', 'state']);
  return {
    id: str(first(doc, ['id', 'run_id', 'runId']) || dirName, 120),
    channel: str(first(doc, ['channel', 'account', 'room']) || 'unassigned', 40).toLowerCase(),
    title: str(first(doc, ['title', 'headline', 'slug', 'idea']) || dirName, 160),
    status: overall(explicit, steps),
    createdAt: time(first(doc, ['created_at', 'createdAt', 'started_at', 'startedAt'])),
    updatedAt: time(first(doc, ['updated_at', 'updatedAt'])) || Math.round(mtimeMs),
    current: (steps.find(s => s.status === 'running' || s.status === 'failed' || s.status === 'review') || {}).name || '',
    steps
  };
}

/* readRails({ root, fs, path, limit }) -> { ok, root, channels:[{ id, runs:[...] }], errors:[{ run, error }], total } */
function readRails(opts) {
  const fs = opts.fs || require('node:fs');
  const path = opts.path || require('node:path');
  const root = String(opts.root || '');
  const limit = Math.max(1, Math.min(MAX_RUNS, Number(opts.limit) || MAX_RUNS));
  const out = { ok: true, root, channels: [], errors: [], total: 0 };
  if (!root) return Object.assign(out, { ok: false, error: 'no autopilot directory is configured' });
  const runsDir = path.join(root, 'runs');
  let names;
  try { names = fs.readdirSync(runsDir); }
  catch (e) { return Object.assign(out, { ok: false, error: e && e.code === 'ENOENT' ? 'no runs yet (' + runsDir + ' does not exist)' : 'cannot read ' + runsDir + ' (' + ((e && e.code) || 'error') + ')' }); }
  const candidates = [];
  for (const name of names) {
    if (!RUN_ID_RE.test(name) || name.startsWith('.')) continue;
    const file = path.join(runsDir, name, 'run.json');
    let st;
    try {
      const dirSt = fs.lstatSync(path.join(runsDir, name));
      if (!dirSt.isDirectory()) continue;
      st = fs.lstatSync(file);
    } catch (_) { continue; }
    if (!st.isFile()) { out.errors.push({ run: name, error: 'run.json is not a regular file' }); continue; }
    candidates.push({ name, file, st });
  }
  out.total = candidates.length;
  candidates.sort((a, b) => b.st.mtimeMs - a.st.mtimeMs);
  const byChannel = new Map();
  for (const c of candidates.slice(0, limit)) {
    if (c.st.size > MAX_BYTES) { out.errors.push({ run: c.name, error: 'run.json is larger than 512 KiB' }); continue; }
    let doc;
    try { doc = JSON.parse(fs.readFileSync(c.file, 'utf8')); }
    catch (e) { out.errors.push({ run: c.name, error: 'run.json is not valid JSON' }); continue; }
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) { out.errors.push({ run: c.name, error: 'run.json is not an object' }); continue; }
    const run = normRun(doc, c.name, c.st.mtimeMs);
    if (!byChannel.has(run.channel)) byChannel.set(run.channel, []);
    byChannel.get(run.channel).push(run);
  }
  out.channels = [...byChannel.entries()]
    .map(([id, runs]) => ({ id, runs: runs.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)) }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

module.exports = { readRails, normRun, normStatus, normSteps };
