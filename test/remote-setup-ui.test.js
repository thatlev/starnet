'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../remote/setup-ui.js'), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));

async function fixture(config = null) {
  const nodes = new Map();
  const element = id => {
    if (!nodes.has(id)) {
      let value = id === 'gateway-port' ? '18791' : '';
      nodes.set(id, { get value() { return value; }, set value(next) { value = String(next); }, dataset: {}, addEventListener() {}, focus() {}, reportValidity: () => true });
    }
    return nodes.get(id);
  };
  const location = { href: '' }, timers = [], calls = [];
  let state = { config, localAvailable: true, installerAvailable: true, busy: false, phase: 'idle', message: '' };
  vm.runInNewContext(source, {
    document: { getElementById: element, querySelector: () => ({ content: 'fixture' }), querySelectorAll: () => [] },
    window: { location }, AbortController, setTimeout, clearTimeout,
    setInterval: callback => timers.push(callback),
    fetch: async (url, init) => {
      calls.push({ url, body: init && init.body });
      if (url === '/api/test') state = { ...state, busy: true, phase: 'working' };
      if (url === '/api/cancel') state = { ...state, busy: false, phase: 'idle' };
      return { ok: true, json: async () => state };
    }
  });
  await settle();
  return { element, location, calls, poll: async next => { state = { ...state, ...next }; await timers[0](); await settle(); } };
}
const config = { host: 'fixture-server', owner: 42, port: 8790, 'gateway-port': 18791 };

test('first verified connection opens automatically, including a stale idle poll while checking', async () => {
  const f = await fixture();
  f.element('host').value = config.host;
  f.element('connection').onsubmit({ preventDefault() {} }); await settle();
  await f.poll({ busy: false, phase: 'idle' });
  assert.equal(f.location.href, '', 'an idle status cannot navigate or disarm the pending first setup');
  await f.poll({ config, busy: false, phase: 'connected' });
  assert.equal(f.location.href, 'starnet-connect://remote');
  f.location.href = '';
  await f.poll({});
  assert.equal(f.location.href, '', 'later polls never reopen a hidden chooser');
});

test('an existing connection stays in setup after testing and cancelled first setup cannot auto-open', async () => {
  const existing = await fixture(config);
  existing.element('connection').onsubmit({ preventDefault() {} }); await settle();
  await existing.poll({ config, busy: false, phase: 'connected' });
  assert.equal(existing.location.href, '');
  assert.equal(existing.element('open').hidden, false);
  const fresh = await fixture(); fresh.element('host').value = config.host;
  fresh.element('connection').onsubmit({ preventDefault() {} }); await settle();
  fresh.element('cancel').onclick(); await settle();
  await fresh.poll({ config, busy: false, phase: 'connected' });
  assert.equal(fresh.location.href, '');
});

test('a saved server is shown by its own name with This Computer second, and the name is sent with the test', async () => {
  const named = await fixture({ ...config, name: 'LevServer' });
  assert.equal(named.element('station-card-name').textContent, 'LEVSERVER');
  assert.equal(named.element('mode-label').textContent, 'LEVSERVER');
  assert.equal(named.element('name').value, 'LevServer');
  named.element('connection').onsubmit({ preventDefault() {} }); await settle();
  assert.equal(JSON.parse(named.calls.find(call => call.url === '/api/test').body).name, 'LevServer');
  // the open button appears only while the form still matches the saved connection, name included
  await named.poll({ config: { ...config, name: 'LevServer' }, busy: false, phase: 'connected' });
  assert.equal(named.element('open').hidden, false);
  const alias = await fixture(config);
  assert.equal(alias.element('station-card-name').textContent, 'FIXTURE-SERVER', 'without a name the SSH alias is shown');
  const fresh = await fixture();
  assert.equal(fresh.element('station-card-name').textContent, 'YOUR SERVER');
  assert.equal(fresh.element('mode-label').textContent, 'CONNECTION SETUP');
});

test('the connection page never says Remote Uplink, and offers the saved server before This Computer', () => {
  const html = fs.readFileSync(path.join(__dirname, '../remote/setup.html'), 'utf8');
  assert.doesNotMatch(html + source, /remote uplink/i);
  assert.ok(html.indexOf('id="remote-choice"') < html.indexOf('id="local"'), 'the server is the first choice');
  assert.match(html, /THIS COMPUTER/);
  assert.match(html, /original local mode/i);
});

test('the status control names the station and says one plain line when it is out of reach', () => {
  const { words } = require('../frontend/app/remote-status.js');
  const ok = { connected: true, name: 'LevServer', state: 'connected', message: 'Connected to LevServer' };
  assert.deepEqual(words(ok), { lost: 'LevServer is not answering — retrying', label: 'LevServer', status: 'Connected to LevServer' });
  assert.equal(words({ ...ok, pending: 1 }).label, 'LevServer · 1 decision');
  assert.equal(words({ ...ok, pending: 2 }).label, 'LevServer · 2 decisions');
  const down = { connected: false, name: 'LevServer', state: 'offline', message: 'LevServer offline — retrying' };
  assert.equal(words(down).label, 'LevServer offline — retrying');
  assert.equal(words({ ...down, state: 'connecting', message: 'Connecting to LevServer…' }).status, 'Connecting to LevServer…');
  assert.equal(words({ ...down, paused: true }).label, 'LevServer · disconnected');
  // the helper is up but the station behind it is not answering
  assert.equal(words({ connected: false, name: 'LevServer', state: 'connected' }).label, 'LevServer is not answering — retrying');
  // an older Mac app reports no name or state: the previous wording stands
  assert.equal(words({ connected: true }).label, 'Gateway');
  assert.equal(words({ connected: true }).status, 'Connected');
  assert.equal(words({ connected: false }).label, 'Gateway · Reconnecting');
});
