'use strict';
// RAILS panel rendering with a minimal fake DOM: rooms per channel, one rail per video, truthful failures.
const assert = require('node:assert/strict');
const Rails = require('../frontend/app/remote-rails.js');

function fakeDoc() {
  function node(tag) {
    return {
      tagName: tag, className: '', textContent: '', title: '', dataset: {}, attrs: {}, children: [],
      append(...k) { this.children.push(...k); }, prepend(...k) { this.children.unshift(...k); },
      replaceChildren(...k) { this.children = k; }, setAttribute(k, v) { this.attrs[k] = String(v); }
    };
  }
  return { createElement: node, body: node('body') };
}
function all(n, out = []) { out.push(n); for (const c of n.children || []) all(c, out); return out; }
const text = n => all(n).map(x => x.textContent).filter(Boolean);

let k = 0;
const doc = fakeDoc();
const body = doc.createElement('div');
Rails.render(doc, body, null, 0);
assert.deepEqual(text(body), ['Loading rails…']); k++;

Rails.render(doc, body, { ok: false, root: '/srv/private/autopilot', error: 'no runs yet (/srv/private/autopilot/runs does not exist)' }, 0);
assert.ok(text(body)[0].startsWith('no runs yet'), 'a failed read is shown as such'); k++;

Rails.render(doc, body, { ok: true, channels: [] }, 0);
assert.deepEqual(text(body), ['No videos in production yet.']); k++;

const now = Date.parse('2026-10-11T21:00:00Z');
const data = { ok: true, errors: [{ run: '098-broken', error: 'run.json is not valid JSON' }], channels: [{ id: 'thatlev', runs: [
  { id: '095-grok', title: 'GROK BOT CAN SHOP', status: 'running', updatedAt: now - 120000, steps: [
    { name: 'evidence', status: 'done' }, { name: 'art', status: 'running', note: 'codex exec' }, { name: 'logos', status: 'pending' }] },
  { id: '096-haiku', title: 'HAIKU ZEBRA', status: 'review', updatedAt: now - 7200000, steps: [{ name: 'package', status: 'review', note: 'needs ✅' }] }
] }] };
Rails.render(doc, body, data, now);
const nodes = all(body);
const rooms = nodes.filter(n => n.tagName === 'section');
assert.equal(rooms.length, 1); k++;
assert.equal(rooms[0].attrs['aria-label'], 'Room thatlev'); k++;
assert.ok(text(body).includes('ROOM · THATLEV')); k++;
const cards = nodes.filter(n => n.tagName === 'article');
assert.deepEqual(cards.map(c => c.dataset.status), ['running', 'review']); k++;
const stops = nodes.filter(n => n.tagName === 'li');
assert.deepEqual(stops.map(s => s.dataset.status), ['done', 'running', 'pending', 'review']); k++;
assert.equal(stops[1].title, 'art: running — codex exec'); k++;
assert.ok(text(body).includes('art: codex exec'), 'running step note shown'); k++;
assert.ok(text(body).includes('095-grok · updated 2m ago')); k++;
assert.ok(text(body).includes('waiting for Lev')); k++;
assert.ok(text(body).includes('098-broken: run.json is not valid JSON'), 'bad manifests surface'); k++;

assert.equal(Rails.buttonLabel(data), 'Rails · 1 waiting · 1 moving'); k++;

// a run's own outcome word wins on the chip; pipeline flags are shown under the rail
Rails.render(doc, body, { ok: true, channels: [{ id: 'thatlev', runs: [
  { id: 'r1', title: 'THEO', status: 'done', outcome: 'scheduled', flags: ['videos are SILENT', 'b', 'c'], steps: [{ name: 'deliver', status: 'done' }] },
  { id: 'r2', title: 'NOPE', status: 'skipped', outcome: 'rejected', steps: [] }] }] }, now);
assert.ok(text(body).includes('scheduled') && text(body).includes('rejected')); k++;
assert.ok(text(body).includes('⚑ videos are SILENT') && text(body).includes('⚑ b') && !text(body).includes('⚑ c'), 'at most two flags'); k++;
assert.equal(Rails.buttonLabel({ ok: true, channels: [] }), 'Rails'); k++;
assert.equal(Rails.buttonLabel({ ok: false }), 'Rails'); k++;
assert.equal(Rails.mount({}, doc), null, 'never mounts outside the remote station'); k++;
console.log('remote-rails-render: OK (' + k + ' assertions)');
