'use strict';
// The saved station's name, its plain-language status, and reconnecting by itself.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http'), net = require('node:net');
const { fork } = require('node:child_process');
const { once } = require('node:events');
const { connectionConfig, stationName, saveConfig, readConfig, planConnection } = require('../remote/config');
const { describeStation, offlinePage, GRACE_MS } = require('../remote/station-status');
const { createGateway, createClient } = require('../remote/gateway');
const base = { host: 'my-server', owner: 42, port: 8790, 'gateway-port': 18791 };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const listen = async server => { await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); return server.address().port; };
const close = server => new Promise(resolve => { server.closeAllConnections?.(); server.close(resolve); });
async function until(check, ms = 15000) {
  const end = Date.now() + ms;
  for (;;) {
    const value = await Promise.resolve().then(check).catch(() => false);
    if (value) return value;
    if (Date.now() > end) throw new Error('condition timed out');
    await sleep(40);
  }
}

test('a saved connection keeps working without a name and shows its alias; a name is optional, trimmed and plain', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'starnet-name-test-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'config.json');
  // exactly the file an installation made before station names existed
  fs.writeFileSync(file, JSON.stringify(base) + '\n', { mode: 0o600 });
  assert.deepEqual(readConfig(file), base, 'an existing connection reads back unchanged');
  assert.equal(stationName(readConfig(file)), 'my-server');
  assert.equal(stationName({ host: 'lev@box.example.com' }), 'box.example.com');
  const named = connectionConfig({ ...base, name: '  LevServer ' });
  assert.equal(named.name, 'LevServer');
  assert.equal(stationName(named), 'LevServer');
  saveConfig(named, file);
  assert.deepEqual(readConfig(file), { ...base, name: 'LevServer' }, 'the name survives a save');
  assert.equal(connectionConfig({ ...base, name: '   ' }).name, undefined, 'a blank name means no name');
  assert.equal(connectionConfig({ ...base, name: 'Lev\n  Server' }).name, 'Lev Server', 'stray whitespace is folded');
  for (const bad of ['x'.repeat(41), 'a<b', 'bell\u0007']) assert.throws(() => connectionConfig({ ...base, name: bad }), /plain characters/);
  // renaming a server is not a different server: it keeps its browser origin (and so its drafts)
  const registry = path.join(dir, 'origins.json');
  const first = planConnection({ ...base, name: 'LevServer' }, registry).cfg;
  const renamed = planConnection({ ...base, name: 'Studio' }, registry).cfg;
  assert.equal(first.port, renamed.port);
});

test('station status is worded once, in plain language', () => {
  const name = 'LevServer';
  assert.deepEqual(describeStation({ name, connected: true }), { state: 'connected', message: 'Connected to LevServer' });
  assert.deepEqual(describeStation({ name, downMs: 0 }), { state: 'connecting', message: 'Connecting to LevServer…' });
  assert.equal(describeStation({ name, downMs: GRACE_MS - 1 }).state, 'connecting', 'a quick reconnect is not an outage');
  assert.deepEqual(describeStation({ name, downMs: GRACE_MS }), { state: 'offline', message: 'LevServer offline — retrying' });
  assert.equal(describeStation({ name, paused: true, connected: true }).message, 'Disconnected from LevServer');
  const signin = describeStation({ name, signin: true, downMs: 60000 });
  assert.equal(signin.state, 'signin');
  assert.match(signin.message, /GitHub sign-in/, 'a sign-in problem is not reported as an outage that retrying will fix');
});

test('a window asking for the station while it is out of reach gets a readable page that retries, not raw JSON', async t => {
  const page = offlinePage('LevServer <offline> — retrying');
  assert.match(page, /LevServer &lt;offline&gt; — retrying/);
  assert.match(page, /http-equiv="refresh"/);
  assert.doesNotMatch(page, /<script/i);
  let message = 'LevServer offline — retrying';
  const client = createClient({ gatewayPort: 1, localPort: 8790, getSession: async () => { throw new Error('offline'); }, connection: {
    status: () => ({ host: 'x', name: 'LevServer', paused: false, connected: false, state: 'offline', message }),
    reconnect: async () => {}, disconnect: async () => {}
  } });
  const port = await listen(client); t.after(() => close(client));
  const url = 'http://127.0.0.1:' + port;
  const document = await fetch(url + '/', { headers: { Accept: 'text/html,application/xhtml+xml' } });
  assert.equal(document.status, 503);
  assert.match(document.headers.get('content-type'), /text\/html/);
  assert.equal(document.headers.get('cache-control'), 'no-store');
  assert.match(await document.text(), /LevServer offline — retrying/);
  const navigation = await fetch(url + '/index.html', { headers: { 'Sec-Fetch-Dest': 'document', Accept: '*/*' } });
  assert.match(await navigation.text(), /retrying/);
  // everything else keeps its JSON error
  for (const route of ['/api/state/snapshot', '/remote/status']) {
    const reply = await fetch(url + route, { headers: { Accept: 'text/html' } });
    assert.equal(reply.status, 503); assert.match(reply.headers.get('content-type'), /json/, route);
  }
  assert.equal((await fetch(url + '/app/a.js', { headers: { Accept: '*/*' } })).headers.get('content-type'), 'application/json');
  const status = await (await fetch(url + '/remote/client/status', { headers: { 'x-starnet-client': '1' } })).json();
  assert.equal(status.name, 'LevServer'); assert.equal(status.state, 'offline');
});

// A stand-in for SSH that really forwards the tunnel port to the in-test gateway, and logs each start.
function fakeSsh(home, nodePath) {
  const bin = path.join(home, 'bin'); fs.mkdirSync(bin, { recursive: true });
  const script = path.join(home, 'fake-ssh.js');
  fs.writeFileSync(script, `const net=require('node:net'),fs=require('node:fs');
const a=process.argv.slice(2),spec=a[a.indexOf('-L')+1].split(':');
fs.appendFileSync(process.env.SSH_LOG,process.pid+'\\n');
net.createServer(c=>{const u=net.connect(Number(spec[3]),'127.0.0.1');c.pipe(u);u.pipe(c);c.on('error',()=>u.destroy());u.on('error',()=>c.destroy());}).listen(Number(spec[1]),'127.0.0.1');
process.on('SIGTERM',()=>process.exit(0));`);
  fs.writeFileSync(path.join(bin, 'ssh'), `#!/bin/sh\nexec "${nodePath}" "${script}" "$@"\n`, { mode: 0o700 });
  fs.writeFileSync(path.join(bin, 'gh'), '#!/bin/sh\necho ghp_fixturefixturefixture0001\n', { mode: 0o700 });
  return bin;
}

test('the connection comes back by itself when SSH drops, and the status says so in plain words', { timeout: 40000 }, async t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'starnet-reconnect-test-')); t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const runtime = http.createServer((req, res) => res.end('ok')), runtimePort = await listen(runtime);
  const gateway = createGateway({ runtimePort, runtimeToken: 'a'.repeat(64), ownerId: 42, verifyIdentity: async () => ({ id: 42, login: 'owner' }) });
  const gatewayPort = await listen(gateway); t.after(async () => { await close(gateway); await close(runtime); });
  const reservation = net.createServer(); const port = await listen(reservation); await new Promise(resolve => reservation.close(resolve));
  saveConfig({ host: 'fixture', owner: 42, port, 'gateway-port': gatewayPort, name: 'Fixture Server' }, path.join(home, '.config/starnet-remote/config.json'));
  const log = path.join(home, 'ssh-starts'), bin = fakeSsh(home, process.execPath);
  const child = fork(path.join(__dirname, '../remote/cli.js'), ['connect'], {
    env: { ...process.env, HOME: home, PATH: bin + ':' + process.env.PATH, SSH_LOG: log }, stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  });
  t.after(() => child.kill());
  await new Promise((resolve, reject) => {
    child.stdout.on('data', data => { if (data.toString().includes('Mac station:')) resolve(); });
    child.once('exit', () => reject(new Error('Client exited before readiness')));
  });
  const url = 'http://127.0.0.1:' + port, headers = { 'x-starnet-client': '1' };
  const status = async () => (await fetch(url + '/remote/client/status', { headers })).json();
  const connected = await until(async () => { const s = await status(); return s.connected && s; });
  assert.equal(connected.state, 'connected'); assert.equal(connected.message, 'Connected to Fixture Server');
  assert.equal(connected.name, 'Fixture Server'); assert.equal(connected.host, 'fixture');
  assert.equal((await fetch(url + '/remote/status')).status, 200);
  const starts = () => fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean);
  assert.equal(starts().length, 1);
  process.kill(Number(starts()[0]), 'SIGTERM'); // the network drops
  await until(() => starts().length >= 2, 12000);
  const back = await until(async () => { const s = await status(); return s.connected && s; });
  assert.equal(back.message, 'Connected to Fixture Server');
  assert.equal((await fetch(url + '/remote/status')).status, 200, 'the station answers again without anyone reopening it');
  const exited = once(child, 'exit'); child.disconnect(); assert.equal((await exited)[0], 0);
});
