#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const crypto = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');
const { createGateway, createClient } = require('./gateway');
const ROOT = path.resolve(__dirname, '..');

function args(argv) {
  const out = { command: argv[0] || 'help' };
  for (let i = 1; i < argv.length; i++) {
    if (!argv[i].startsWith('--') || !argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error('Expected --option value');
    out[argv[i].slice(2)] = argv[++i];
  }
  return out;
}
function port(value, fallback) {
  const n = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(n) || n < 1024 || n > 65535) throw new Error('Invalid port');
  return n;
}
function privateDirectory(dir) { fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); fs.chmodSync(dir, 0o700); }
function configPath() { return path.join(os.homedir(), '.config', 'starnet-remote', 'config.json'); }
function readConfig() { return JSON.parse(fs.readFileSync(configPath(), 'utf8')); }
function waitPort(number, child, ms = 30000) {
  return new Promise((resolve, reject) => {
    const end = Date.now() + ms;
    const tick = () => {
      if (child && child.exitCode !== null) return reject(new Error('Process exited before readiness'));
      const socket = net.connect({ host: '127.0.0.1', port: number });
      socket.once('connect', () => { socket.destroy(); resolve(); });
      socket.once('error', () => { socket.destroy(); if (Date.now() >= end) reject(new Error('Connection timed out')); else setTimeout(tick, 150); });
    };
    tick();
  });
}
async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const p = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return p;
}
async function assertFree(number) {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(number, '127.0.0.1', resolve); });
  await new Promise(resolve => server.close(resolve));
}
function ghToken() {
  return execFileSync('gh', ['auth', 'token', '--hostname', 'github.com'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}
async function serve(o) {
  process.umask(0o077);
  const root = path.resolve(o.data || path.join(os.homedir(), '.local/share/starnet-remote'));
  privateDirectory(root);
  const ownerId = Number(o.owner);
  if (!Number.isSafeInteger(ownerId) || ownerId <= 0) throw new Error('--owner must be your numeric GitHub user ID');
  const gatewayPort = port(o.port, 18791), runtimePort = port(o['runtime-port'], 18792);
  if (gatewayPort === runtimePort) throw new Error('Gateway and runtime ports must differ');
  await assertFree(gatewayPort); await assertFree(runtimePort);
  const runtimeToken = crypto.randomBytes(32).toString('hex');
  const child = spawn(process.execPath, ['--max-old-space-size=512', path.join(ROOT, 'sidecar/index.js')], {
    cwd: root, env: { ...process.env, STARNET_PORT: String(runtimePort), STARNET_API_TOKEN: runtimeToken,
      STARNET_WORKSPACES: path.join(root, 'workspaces'), STARNET_REMOTE: '1', STARNET_DESKTOP_SHELL: '0',
      NODE_PATH: path.join(ROOT, 'remote/node_modules'),
      STARNET_BROWSER_HEADLESS: '1', STARNET_ENV_DISCOVERY: '0', SKYNET_ENV_DISCOVERY: '0',
      STARNET_MAX_CONCURRENT_AGENTS: process.env.STARNET_MAX_CONCURRENT_AGENTS || '3' },
    stdio: ['ignore', 'inherit', 'inherit']
  });
  let stopping = false, gateway;
  const stop = () => { if (stopping) return; stopping = true; gateway?.close(); child.kill('SIGTERM'); setTimeout(() => process.exit(0), 5000).unref(); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  child.on('error', () => { console.error('Runtime failed to start'); process.exit(1); });
  child.on('exit', code => { gateway?.close(); process.exit(stopping ? 0 : (code || 1)); });
  await waitPort(runtimePort, child);
  gateway = createGateway({ runtimePort, runtimeToken, ownerId });
  await new Promise((resolve, reject) => { gateway.once('error', reject); gateway.listen(gatewayPort, '127.0.0.1', resolve); });
  console.log('StarNet headless gateway ready on 127.0.0.1:' + gatewayPort + '; owner GitHub ID ' + ownerId);
}
async function connect(o) {
  const cfg = { ...readConfig(), ...o };
  const localPort = port(cfg.port, 8790), remotePort = port(cfg['gateway-port'], 18791);
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,100}$/.test(cfg.host || '')) throw new Error('Invalid SSH host alias');
  await assertFree(localPort);
  const tunnelPort = await freePort();
  let ssh, ready = false, stopping = false, reconnectTimer, delay = 1000, session = null, login = null;
  function startTunnel() {
    ready = false;
    ssh = spawn('ssh', ['-N', '-T', '-o', 'BatchMode=yes', '-o', 'ExitOnForwardFailure=yes',
      '-o', 'StrictHostKeyChecking=yes', '-o', 'ControlMaster=no', '-o', 'ControlPath=none', '-o', 'ControlPersist=no', '-o', 'ServerAliveInterval=5', '-o', 'ServerAliveCountMax=2',
      '-o', 'ConnectTimeout=12', '-L', '127.0.0.1:' + tunnelPort + ':127.0.0.1:' + remotePort, cfg.host],
    { stdio: ['ignore', 'ignore', 'pipe'] });
    // SSH errors may contain host paths; never print any authentication payload.
    ssh.stderr.on('data', () => {});
    ssh.on('error', () => {});
    ssh.once('close', () => {
      ready = false;
      if (!stopping) { console.error('SSH connection lost; reconnecting. Server work continues.'); reconnectTimer = setTimeout(startTunnel, delay); delay = Math.min(delay * 2, 5000); }
    });
    const current = ssh;
    waitPort(tunnelPort, current).then(() => { if (ssh === current && current.exitCode === null) { ready = true; delay = 1000; } }).catch(() => current.kill());
  }
  const getSession = async () => {
    if (!ready) throw new Error('SSH reconnecting');
    if (session && session.expiresAt > Date.now() + 5 * 60 * 1000) return session;
    if (login) return login;
    login = (async () => {
      const response = await fetch('http://127.0.0.1:' + tunnelPort + '/remote/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ githubToken: ghToken() }), signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) throw new Error('GitHub station login failed (' + response.status + ')');
      const result = await response.json();
      if (result.user?.id !== Number(cfg.owner)) throw new Error('The gateway returned an unexpected owner');
      session = result;
      console.log('Connected as ' + result.user.login + ' · execution on ' + cfg.host);
      return result;
    })().finally(() => { login = null; });
    return login;
  };
  startTunnel();
  const client = createClient({ gatewayPort: tunnelPort, localPort, getSession, invalidateSession: () => { session = null; } });
  await new Promise((resolve, reject) => { client.once('error', reject); client.listen(localPort, '127.0.0.1', resolve); });
  console.log('Mac station: http://127.0.0.1:' + localPort);
  const stop = () => {
    if (stopping) return;
    stopping = true; clearTimeout(reconnectTimer); client.closeAllConnections(); client.close(); ssh?.kill('SIGTERM');
    setTimeout(() => process.exit(0), 200).unref();
  };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
async function main() {
  const o = args(process.argv.slice(2));
  if (o.command === 'serve') return serve(o);
  if (o.command === 'connect') return connect(o);
  if (o.command === 'configure') {
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,100}$/.test(o.host || '') || !Number.isSafeInteger(Number(o.owner)) || Number(o.owner) <= 0) throw new Error('configure --host SSH_ALIAS --owner NUMERIC_GITHUB_ID');
    const target = configPath(); privateDirectory(path.dirname(target));
    fs.writeFileSync(target, JSON.stringify({ host: o.host, owner: Number(o.owner), port: port(o.port, 8790), 'gateway-port': port(o['gateway-port'], 18791) }) + '\n', { mode: 0o600 });
    fs.chmodSync(target, 0o600);
    console.log('Connection settings saved. GitHub credentials stay in gh authentication storage.'); return;
  }
  if (o.command === 'status') {
    if (process.platform === 'linux') {
      console.log(execFileSync('systemctl', ['show', 'starnet-remote.service', '--property=ActiveState,SubState,MemoryCurrent,TasksCurrent'], { encoding: 'utf8' }).trim());
      return;
    }
    const cfg = readConfig();
    const r = await fetch('http://127.0.0.1:' + port(cfg.port, 8790) + '/remote/status', { signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error('Station is disconnected (' + r.status + ')');
    console.log(JSON.stringify(await r.json(), null, 2)); return;
  }
  console.log('StarNet Remote\n\n  serve --owner GITHUB_ID [--data PATH] [--port 18791] [--runtime-port 18792]\n  configure --host lev-server-direct --owner GITHUB_ID [--port 8790] [--gateway-port 18791]\n  connect\n  status\n\nLinux: Node 22+ and the locked remote/package.json dependencies. No display, browser, voice runtime or GPU required.\nMac: gh auth login --hostname github.com --web, then configure and connect.\nAuthentication uses the GitHub CLI OAuth application and verifies the numeric owner ID.');
}
if (require.main === module) main().catch(e => { console.error('StarNet: ' + e.message); process.exit(1); });
module.exports = { args, port, waitPort, freePort };
