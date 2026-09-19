'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const token = document.querySelector('meta[name=setup-token]').content;
  let initialized = false, polling = false, current = null, lastMessage = null;
  const input = () => ({ host: $('host').value.trim(), 'ssh-port': $('ssh-port').value, 'gateway-port': $('gateway-port').value });
  function invalidate() { $('open').hidden = true; $('test').hidden = false; }
  function render(state) {
    current = state;
    if (!initialized) {
      initialized = true;
      if (state.config) { $('host').value = state.config.host; $('ssh-port').value = state.config['ssh-port'] || ''; $('gateway-port').value = state.config['gateway-port']; }
    }
    $('identity').textContent = state.user ? 'Signed in as ' + state.user.login : 'Use GitHub to verify station ownership.';
    $('login').textContent = state.user ? 'Use another GitHub account ↗' : 'Sign in with GitHub ↗';
    $('return').hidden = !state.config;
    const messageKey = state.phase + ':' + state.message;
    if (messageKey !== lastMessage) { $('status').textContent = state.message; $('status').dataset.phase = state.phase; lastMessage = messageKey; }
    $('cancel').hidden = !state.busy;
    for (const id of ['login', 'profile', 'test', 'ssh', 'install', 'host', 'ssh-port', 'gateway-port']) $(id).disabled = state.busy || (id === 'install' && !state.installerAvailable) || (id === 'gateway-port' && document.querySelector('input[name=mode]:checked').value === 'new');
    document.querySelectorAll('input[name=mode]').forEach(el => el.disabled = state.busy);
    $('return').disabled = state.busy;
    const canOpen = !state.busy && state.phase === 'connected' && state.config && JSON.stringify(input()) === JSON.stringify({ host: state.config.host, 'ssh-port': String(state.config['ssh-port'] || ''), 'gateway-port': String(state.config['gateway-port']) });
    $('test').hidden = !!canOpen; $('open').hidden = !canOpen;
  }
  async function request(route, data) {
    const abort = new AbortController(), timeout = setTimeout(() => abort.abort(), 20000);
    try {
    const response = await fetch('/api/' + route, { method: data === undefined ? 'GET' : 'POST', headers: { 'x-starnet-setup': token, ...(data === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: data === undefined ? undefined : JSON.stringify(data), signal: abort.signal });
    const state = await response.json();
    if (!response.ok) throw new Error(state.error || 'The request did not complete.');
    render(state);
    } finally { clearTimeout(timeout); }
  }
  async function action(route, data = {}) {
    try { await request(route, data); }
    catch (error) { $('status').textContent = error.message; $('status').dataset.phase = 'error'; }
  }
  function openStation() {
    if (window.webkit?.messageHandlers?.connectionSetup) window.webkit.messageHandlers.connectionSetup.postMessage({ event: 'open-station' });
    else window.location.href = 'http://127.0.0.1:' + (current.config?.port || 8790);
  }
  $('login').onclick = () => action('login'); $('profile').onclick = () => action('profile');
  $('connection').onsubmit = event => { event.preventDefault(); invalidate(); action('test', input()); };
  $('cancel').onclick = () => action('cancel');
  $('ssh').onclick = () => { if ($('connection').reportValidity()) action('ssh', input()); };
  $('install').onclick = () => { if ($('connection').reportValidity()) action('install', input()); };
  $('open').onclick = openStation; $('return').onclick = openStation;
  for (const id of ['host', 'ssh-port', 'gateway-port']) $(id).addEventListener('input', invalidate);
  document.querySelectorAll('input[name=mode]').forEach(el => el.onchange = () => { $('install-panel').hidden = el.value !== 'new'; if (el.value === 'new') $('gateway-port').value = '18791'; $('gateway-port').disabled = el.value === 'new'; invalidate(); });
  async function poll() {
    if (polling) return; polling = true;
    try { await request('status'); } catch (_) { $('status').textContent = 'The connection helper stopped. Reopen StarNet to reconnect.'; }
    finally { polling = false; }
  }
  request('status').then(() => { if (!current.busy) return action('profile'); }).catch(() => { $('status').textContent = 'Connection Setup could not start. Reopen StarNet.'; });
  setInterval(poll, 1000);
})();
