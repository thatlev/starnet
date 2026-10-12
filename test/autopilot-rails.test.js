'use strict';
// RAILS: read-only normalization of an external pipeline's runs/<id>/run.json manifests. Temp dirs only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readRails, normStatus } = require('../sidecar/autopilot-rails');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rails-'));
let n = 0;
try {
  // no runs directory yet: an honest refusal, not an empty success
  let out = readRails({ root });
  assert.equal(out.ok, false); assert.match(out.error, /no runs yet/); n += 2;
  assert.equal(readRails({ root: '' }).ok, false); n++;

  const runs = path.join(root, 'runs');
  fs.mkdirSync(runs);
  const write = (id, doc, mtime) => {
    fs.mkdirSync(path.join(runs, id), { recursive: true });
    const f = path.join(runs, id, 'run.json');
    fs.writeFileSync(f, typeof doc === 'string' ? doc : JSON.stringify(doc));
    if (mtime) fs.utimesSync(f, mtime / 1000, mtime / 1000);
  };
  write('095-grok', { id: '095-grok', channel: 'thatlev', title: 'GROK BOT CAN SHOP', steps: [
    { name: 'evidence', status: 'done', started_at: '2026-10-11T20:00:00Z', finished_at: '2026-10-11T20:01:00Z' },
    { name: 'copy', status: 'done' },
    { name: 'art', status: 'running', note: 'codex exec' },
    { name: 'logos', status: 'pending' }
  ] }, Date.parse('2026-10-11T20:05:00Z'));
  write('096-haiku', { run_id: '096-haiku', account: 'THATLEV', headline: 'HAIKU ZEBRA', steps: { evidence: 'ok', copy: { state: 'failed', error: 'no copy pick' }, art: 'todo' } }, Date.parse('2026-10-11T20:10:00Z'));
  write('097-other', { channel: 'second', slug: 'other', status: 'needs_approval', updated: '2026-10-11T22:00:00+0300', steps: [{ step: 'package', status: 'done', started: '2026-10-11T21:59:00+0300', finished: '2026-10-11T22:00:00+0300' }] }, Date.parse('2026-10-11T19:00:00Z'));
  write('098-broken', '{ not json', Date.parse('2026-10-11T18:00:00Z'));
  write('099-array', '[1,2]', Date.parse('2026-10-11T18:00:00Z'));
  fs.mkdirSync(path.join(runs, '100-empty'));                              // a run dir with no manifest yet is skipped
  fs.writeFileSync(path.join(runs, 'stray.txt'), 'x');                     // a file, not a run dir
  fs.symlinkSync(path.join(runs, '095-grok'), path.join(runs, '101-link')); // symlinked run dirs are not followed

  out = readRails({ root });
  assert.equal(out.ok, true); n++;
  assert.deepEqual(out.channels.map(c => c.id), ['second', 'thatlev'], 'grouped by lower-cased channel'); n++;
  const thatlev = out.channels.find(c => c.id === 'thatlev');
  assert.deepEqual(thatlev.runs.map(r => r.id), ['096-haiku', '095-grok'], 'newest first'); n++;
  const grok = thatlev.runs[1];
  assert.equal(grok.title, 'GROK BOT CAN SHOP'); n++;
  assert.equal(grok.status, 'running', 'derived from steps'); n++;
  assert.equal(grok.current, 'art'); n++;
  assert.deepEqual(grok.steps.map(s => s.name + ':' + s.status), ['evidence:done', 'copy:done', 'art:running', 'logos:pending']); n++;
  assert.equal(grok.steps[0].startedAt, Date.parse('2026-10-11T20:00:00Z')); n++;
  assert.equal(grok.steps[2].note, 'codex exec'); n++;
  const haiku = thatlev.runs[0];
  assert.equal(haiku.status, 'failed'); n++;
  assert.deepEqual(haiku.steps.map(s => s.name + ':' + s.status), ['evidence:done', 'copy:failed', 'art:pending'], 'object map of steps'); n++;
  assert.equal(haiku.steps[1].note, 'no copy pick'); n++;
  const other = out.channels[0].runs[0];
  assert.equal(other.status, 'review', 'explicit status wins'); n++;
  assert.equal(other.title, 'other'); n++;
  assert.equal(other.updatedAt, Date.parse('2026-10-11T19:00:00Z'), 'the factory runtime\'s "updated" field'); n++;
  assert.equal(other.steps[0].startedAt, Date.parse('2026-10-11T18:59:00Z'), '"started"/"finished" step fields'); n++;
  assert.deepEqual(out.errors.map(e => e.run).sort(), ['098-broken', '099-array'], 'bad manifests are reported, never invented'); n++;
  assert.equal(out.total, 5, 'only real run directories with a manifest count'); n++;

  // the Kedr pipeline's own manifest (autopilot/pipeline/runstate.py): run status "delivered" = waiting for Lev's ✅,
  // step times "started"/"ended", current_step, flags
  write('20261012-0700-theo-linux', { run_id: '20261012-0700-theo-linux', kind: 'pipeline', channel: 'thatlev',
    title: 'THEO DITCHED MACOS', created: '2026-10-12T07:00:00+0300', updated: '2026-10-12T07:20:00+0300',
    status: 'delivered', current_step: 'deliver', flags: ['sound: no Lev-approved sound in the bank', { odd: 1 }],
    steps: [{ name: 'brief', status: 'done', started: '2026-10-12T07:00:01+0300', ended: '2026-10-12T07:00:40+0300', error: null, detail: 'ok' },
      { name: 'deliver', status: 'done', started: '2026-10-12T07:19:00+0300', ended: '2026-10-12T07:20:00+0300' }] }, Date.parse('2026-10-11T17:00:00Z'));
  write('20261012-0710-rejected', { run_id: '20261012-0710-rejected', channel: 'thatlev', title: 'NOPE', status: 'rejected',
    steps: [{ name: 'brief', status: 'done' }] }, Date.parse('2026-10-11T16:00:00Z'));
  write('20261012-0720-art', { run_id: '20261012-0720-art', channel: 'thatlev', title: 'ART', status: 'running', current_step: 'art',
    steps: [{ name: 'brief', status: 'done' }, { name: 'art', status: 'pending' }] }, Date.parse('2026-10-11T15:00:00Z'));
  out = readRails({ root });
  const byId = Object.fromEntries(out.channels.flatMap(c => c.runs).map(r => [r.id, r]));
  const theo = byId['20261012-0700-theo-linux'];
  assert.equal(theo.status, 'review', '"delivered" = waiting for Lev'); n++;
  assert.equal(theo.outcome, 'waiting for Lev'); n++;
  assert.equal(theo.createdAt, Date.parse('2026-10-12T04:00:00Z')); n++;
  assert.equal(theo.steps[0].endedAt, Date.parse('2026-10-12T04:00:40Z'), 'the pipeline\'s step "ended" field'); n++;
  assert.equal(theo.steps[0].note, 'ok', 'detail is the note when error is null'); n++;
  assert.equal(theo.current, 'deliver', 'current_step when no step is open'); n++;
  assert.deepEqual(theo.flags, ['sound: no Lev-approved sound in the bank', '{"odd":1}']); n++;
  assert.equal(byId['20261012-0710-rejected'].status, 'skipped'); assert.equal(byId['20261012-0710-rejected'].outcome, 'rejected'); n += 2;
  assert.equal(byId['20261012-0720-art'].current, 'art'); assert.equal(byId['20261012-0720-art'].outcome, ''); n += 2;
  assert.equal(normStatus('delivered'), 'review'); assert.equal(normStatus('rejected'), 'skipped'); n += 2;
  for (const id of ['20261012-0700-theo-linux', '20261012-0710-rejected', '20261012-0720-art']) fs.rmSync(path.join(runs, id), { recursive: true });

  // limit keeps the newest manifests
  out = readRails({ root, limit: 1 });
  assert.equal(out.channels.length, 1); assert.equal(out.channels[0].runs[0].id, '096-haiku'); n += 2;

  // oversized manifest refused
  write('102-huge', JSON.stringify({ title: 'x'.repeat(600 * 1024) }), Date.now());
  out = readRails({ root });
  assert.ok(out.errors.some(e => e.run === '102-huge' && /512 KiB/.test(e.error))); n++;

  assert.equal(normStatus('In Progress'), 'running'); assert.equal(normStatus('weird'), 'unknown'); assert.equal(normStatus(''), 'pending'); n += 3;
  console.log('autopilot-rails: OK (' + n + ' assertions)');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
