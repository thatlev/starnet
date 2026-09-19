'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), net = require('node:net');
const { spawn, fork } = require('node:child_process');
const { once } = require('node:events');
const { exportViewerStorage, loopbackPort } = require('../remote/migrate-viewer');
const { saveConfig } = require('../remote/config');
function temporary(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'starnet-desktop-test-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true })); return home;
}
function origin(port) {
  const p = Buffer.alloc(2); p.writeUInt16LE(port);
  const half = Buffer.concat([Buffer.from('04000000016874747009000000013132372e302e302e3101', 'hex'), p]);
  return Buffer.concat([half, half]);
}
test('legacy viewer import preserves drafts privately and is repeatable without replacing newer data', { skip: !require('node:module').isBuiltin('node:sqlite') }, t => {
  const { DatabaseSync } = require('node:sqlite');
  const home = temporary(t), base = path.join(home, 'Library/WebKit/com.thatlev.starnet.remote/WebsiteData/Default/a/a');
  fs.mkdirSync(path.join(base, 'LocalStorage'), { recursive: true });
  fs.writeFileSync(path.join(base, 'origin'), origin(8790));
  const db = new DatabaseSync(path.join(base, 'LocalStorage/localstorage.sqlite3'));
  db.exec('CREATE TABLE ItemTable (key TEXT UNIQUE, value BLOB)');
  db.prepare('INSERT INTO ItemTable VALUES (?, ?)').run('starnet.interview.draft.agent:1', Buffer.from('Draft α', 'utf16le'));
  db.prepare('INSERT INTO ItemTable VALUES (?, ?)').run('unrelated', 'ignored');
  db.close();
  exportViewerStorage(home);
  const output = path.join(home, '.config/starnet-remote/legacy-viewer-storage.json');
  assert.deepEqual(JSON.parse(fs.readFileSync(output)), { 8790: [['starnet.interview.draft.agent:1', 'Draft α']] });
  assert.equal(fs.statSync(output).mode & 0o777, 0o600);
  fs.writeFileSync(output, '{}'); exportViewerStorage(home);
  assert.equal(fs.readFileSync(output, 'utf8'), '{}');
  assert.equal(loopbackPort(origin(18790)), null);
  assert.equal(loopbackPort(Buffer.from('https://example.com')), null);
});
test('unified helper exits when its native launcher closes the lifetime pipe', { timeout: 10000 }, async t => {
  const home = temporary(t);
  const child = spawn(process.execPath, [path.join(__dirname, '../remote/desktop.js')], {
    env: { ...process.env, HOME: home, STARNET_UNIFIED_DESKTOP: '1', STARNET_DESKTOP_STDIN_LIFETIME: '1' },
    stdio: ['pipe', 'ignore', 'pipe']
  });
  t.after(() => child.kill());
  let error = ''; child.stderr.on('data', data => error += data);
  child.stdin.end();
  const [code] = await once(child, 'exit'); assert.equal(code, 0, error);
});
test('desktop client releases its origin and SSH child when the helper crashes', { timeout: 10000 }, async t => {
  const home = temporary(t), bin = path.join(home, 'bin'); fs.mkdirSync(bin);
  const ssh = path.join(bin, 'ssh'); fs.writeFileSync(ssh, '#!/bin/sh\nexec /bin/sleep 60\n', { mode: 0o700 });
  const reservation = net.createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
  saveConfig({ host: 'fixture', owner: 42, port, 'gateway-port': 18791 }, path.join(home, '.config/starnet-remote/config.json'));
  const child = fork(path.join(__dirname, '../remote/cli.js'), ['connect'], {
    env: { ...process.env, HOME: home, PATH: bin }, stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  });
  t.after(() => child.kill());
  await new Promise((resolve, reject) => {
    child.stdout.on('data', data => { if (data.toString().includes('Mac station:')) resolve(); });
    child.once('exit', () => reject(new Error('Client exited before readiness')));
  });
  const exited = once(child, 'exit'); child.disconnect();
  assert.equal((await exited)[0], 0);
  const check = net.createServer(); check.listen(port, '127.0.0.1'); await once(check, 'listening'); check.close();
});
