'use strict';
const StationConfig = (() => {
  const core = StationConfigCore;
  const identityKey = 'starnet.config.viewer.' + (window.__STARNET_NATIVE__ ? 'mac' : 'browser');
  const clientId = crypto.randomUUID();
  let viewerId;
  try { viewerId = localStorage.getItem(identityKey); } catch (_) {}
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(viewerId || '')) viewerId = crypto.randomUUID();
  try { localStorage.setItem(identityKey, viewerId); } catch (_) {}
  let applying = false;
  async function api(action, body = {}) {
    const res = await fetch('/api/station-config/' + action, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
    const value = await res.json();
    if (!res.ok || value.ok === false) throw new Error(value.error || 'Configuration request failed');
    return value;
  }
  function capture() {
    if (typeof App === 'undefined' || !App.stationLayout || !App.stationLayout()) throw new Error('Open your station before editing configuration');
    return core.validate({ starnetConfig: 1, settings: StationUI.configSettings(), layout: App.stationLayout() });
  }
  function check(before, after, actorRunId) {
    if (core.canonical(capture()) !== core.canonical(before)) throw new Error('Configuration changed; read it again before applying');
    if (typeof Build !== 'undefined' && Build.isOpen && Build.isOpen()) throw new Error('Close Build mode before applying configuration');
    if (!actorRunId && StationUI.runningCount()) throw new Error('Wait for active agent work to finish before changing configuration');
    const next = core.validate(after);
    if (core.canonical(before.layout) !== core.canonical(next.layout)) {
      for (const room of Object.values(next.layout.rooms)) {
        if (!Object.hasOwn(WorldModel.ROOM_KINDS, room.kind)) throw new Error('Unknown room kind: ' + room.kind);
        for (const [field, catalog] of [['floorStyle', WorldModel.FLOOR_STYLES], ['floorMat', WorldModel.FLOOR_MATERIALS],
          ['wallStyle', WorldModel.FLOOR_STYLES], ['wallMat', WorldModel.WALL_MATERIALS],
          ['hullStyle', WorldModel.FLOOR_STYLES], ['hullMat', WorldModel.HULL_MATERIALS]]) {
          if (room[field] != null && !Object.hasOwn(catalog, room[field])) throw new Error('Unknown ' + field);
        }
      }
      for (const p of next.layout.props) if (!PropSprites.spec(p.t)) throw new Error('Unknown prop type: ' + p.t);
      const probe = WorldModel.deserialize(before.layout);
      const result = probe.replaceLayout(next.layout);
      if (!result.ok) throw new Error('Layout refused: ' + (result.message || result.error));
      next.layout = probe.serialize();
    }
    return next;
  }
  async function apply(before, after, actorRunId) {
    if (applying) throw new Error('Another configuration edit is in progress');
    applying = true;
    try {
      // Preserve all current conversations/drafts before a floor edit. The save store's revision
      // check remains the authority; a conflicting viewer is never silently overwritten.
      App.persist();
      if (!await CloudSave.flush({ force: true })) throw new Error('Current station could not be saved; resolve its save warning first');
      const next = check(before, after, actorRunId);
      const layoutChanged = core.canonical(before.layout) !== core.canonical(next.layout);
      try {
        if (layoutChanged) App.replaceStationLayout(next.layout);
        StationUI.applyConfigSettings(next.settings);
        if (layoutChanged) {
          App.persist();
          if (!await CloudSave.flush({ force: true })) throw new Error('Station save was not acknowledged');
          const saved = await CloudSave.pull();
          if (!saved || core.canonical(saved.station) !== core.canonical(App.stationLayout())) throw new Error('Saved layout could not be verified');
        }
        const actual = capture();
        if (core.canonical(actual) !== core.canonical(next)) throw new Error('Configuration read-back did not match');
        StationUI.notify('Configuration updated. Previous settings and layout are in Configuration history.', 'good');
        return actual;
      } catch (error) {
        // Best-effort rollback is reported, never hidden. The server already holds the original snapshot.
        let restored = false;
        try {
          if (layoutChanged) App.replaceStationLayout(before.layout);
          StationUI.applyConfigSettings(before.settings);
          App.persist(); restored = await CloudSave.flush({ force: true });
        } catch (_) {}
        throw new Error(error.message + (restored ? ' Previous configuration restored.' : ' Use Configuration history to recover the saved snapshot.'));
      }
    } finally { applying = false; }
  }
  async function command(msg) {
    if (!msg || !String(msg.verb).startsWith('config.') || !msg.id ||
        (msg.args?.viewerId && msg.args.viewerId !== viewerId) ||
        (msg.args?.clientId && msg.args.clientId !== clientId) ||
        (!msg.args?.viewerId && document.hidden && !window.__STARNET_NATIVE__)) return;
    // Native windows remain valid agent targets while another app is in front or the display is
    // asleep. Only hidden browser tabs defer discovery; explicit viewer/client targets always win.
    // Do not claim on a title/onboarding page without a live station. Another open viewer may answer.
    try { capture(); } catch (_) { return; }
    let claim;
    try { claim = await api('claim', { id: msg.id, viewerId, clientId }); } catch (_) { return; }
    if (!claim.claimed) return;
    const response = { id: msg.id, viewerId, clientId };
    try {
      if (msg.verb === 'config.capture') response.result = capture();
      else if (msg.verb === 'config.validate') response.result = check(msg.args.before, msg.args.after, msg.args.actorRunId);
      else if (msg.verb === 'config.apply') response.result = await apply(msg.args.before, msg.args.after, msg.args.actorRunId);
      else throw new Error('Unsupported configuration command');
      response.ok = true;
    } catch (error) { response.ok = false; response.error = error.message; }
    try { await api('ack', response); } catch (_) { /* history remains unconfirmed; never replay a mutation */ }
    if (msg.verb === 'config.apply' && response.ok) StationUI.refreshConfigControls();
  }
  function mount(host) {
    host.classList.add('settings-pane', 'config-pane');
    host.innerHTML = '<p class="set-about">Each applied edit keeps a recovery snapshot. Equipment changes also change agent capabilities.</p>' +
      '<label for="station-config-json" class="set-sub-k">EDITABLE JSON</label>' +
      '<textarea id="station-config-json" class="key-input config-editor" spellcheck="false" aria-describedby="station-config-message"></textarea>' +
      '<div class="set-save"><button class="bb sm" data-config="apply">APPLY CHANGES</button><button class="bb sm" data-config="read">RELOAD</button><button class="bb sm" data-config="export">EXPORT JSON</button></div>' +
      '<p id="station-config-message" class="msg" role="status" aria-live="polite"></p>' +
      '<h4 class="ms-h">CHANGE HISTORY</h4><div class="config-history"></div>';
    const editor = host.querySelector('textarea'), message = host.querySelector('.msg'), list = host.querySelector('.config-history');
    let snapshot = null, busy = false;
    function show(text, bad = false) { message.textContent = text; message.className = 'msg' + (bad ? ' bad' : ''); }
    function buttons(disabled) { host.querySelectorAll('button').forEach(b => { b.disabled = disabled; }); editor.disabled = disabled; }
    async function history() {
      const data = await api('request', { action: 'history' });
      list.replaceChildren();
      const rows = data.entries.filter(e => e.viewerId === viewerId);
      if (!rows.length) { const p = document.createElement('p'); p.className = 'dim'; p.textContent = 'No configuration edits yet.'; list.append(p); }
      for (const e of rows) {
        const row = document.createElement('div'); row.className = 'config-history-row';
        const text = document.createElement('div');
        const title = document.createElement('strong'); title.textContent = e.label;
        const detail = document.createElement('p'); detail.className = 'dim'; detail.textContent = new Date(e.at).toLocaleString() + ' · ' + e.status + ' · ' + e.changes.join(', ');
        text.append(title, detail);
        const restore = document.createElement('button'); restore.className = 'bb sm'; restore.textContent = 'RESTORE BEFORE';
        restore.onclick = () => run(async () => {
          if (!snapshot) throw new Error('Reload configuration first');
          snapshot = await api('request', { action: 'restore', id: e.id, viewerId, clientId, revision: snapshot.revision });
          editor.value = JSON.stringify(snapshot.config, null, 2); await history(); show('Restored. The configuration it replaced is also backed up.');
        });
        row.append(text, restore); list.append(row);
      }
    }
    async function run(fn) {
      if (busy) return;
      busy = true; buttons(true); show('Working…');
      try { await fn(); } catch (e) { show(e.message, true); }
      finally { busy = false; buttons(false); }
    }
    async function read() {
      snapshot = await api('request', { action: 'get', viewerId, clientId });
      editor.value = JSON.stringify(snapshot.config, null, 2); await history(); show('Loaded current configuration.');
    }
    host.querySelector('[data-config="read"]').onclick = () => run(read);
    host.querySelector('[data-config="apply"]').onclick = () => run(async () => {
      if (!snapshot) throw new Error('Reload configuration first');
      let config; try { config = JSON.parse(editor.value); } catch (_) { throw new Error('Invalid JSON. Correct it before applying.'); }
      snapshot = await api('request', { action: 'apply', viewerId, clientId, revision: snapshot.revision, config, label: 'Settings configuration edit' });
      editor.value = JSON.stringify(snapshot.config, null, 2); await history(); show(snapshot.applied ? 'Applied and backed up.' : 'No changes to apply.');
    });
    host.querySelector('[data-config="export"]').onclick = () => run(async () => {
      if (!snapshot) throw new Error('Reload configuration first');
      const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = 'starnet-configuration.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000); show('Exported the last confirmed configuration.');
    });
    run(read);
  }
  document.addEventListener('DOMContentLoaded', () => U.bus.on('station.command', command));
  return { mount, capture, viewerId, command, check, apply };
})();
