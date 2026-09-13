'use strict';
// Remote transport chrome. Runtime facts only: never infer completion from a lost
// connection, and never resend a run. The existing SSE bridge animates the station.
document.addEventListener('DOMContentLoaded', () => {
  if (!window.__STARNET_REMOTE__) return;
  let paintTimer = null;
  const mirror = window.makeRemoteChannels({ channels: Channels,
    locallyDriven: id => typeof Chat !== 'undefined' && Chat.ownsRemoteTransport && Chat.ownsRemoteTransport(id),
    changed: () => {
      if (paintTimer) return;
      paintTimer = setTimeout(() => {
        paintTimer = null;
        if (typeof Chat !== 'undefined' && Chat.renderRemoteActivity) Chat.renderRemoteActivity();
        if (typeof App !== 'undefined' && App.refreshRail) App.refreshRail();
      }, 100);
    },
    settled: () => setTimeout(() => { if (typeof Chat !== 'undefined' && Chat.refreshRemoteTranscript) Chat.refreshRemoteTranscript(); }, 100)
  });
  for (const name of ['agent.run.start', 'agent.token', 'agent.tool_call', 'agent.tool_result', 'permission.prompt', 'agent.run.end']) U.bus.on(name, p => mirror.event(name, p));
  const style = document.createElement('style');
  // Square station surfaces intentionally retain zero corner radius, including
  // their inset controls. No floating status overlay competes with the scene.
  style.textContent = `
    #gateway-control {display:inline-flex;align-items:center;gap:6px;flex-shrink:0;min-height:32px;padding:4px 8px;border:1px solid transparent;border-radius:0;background:transparent;color:var(--text,#eec88f);font:14px/1.2 monospace;cursor:pointer;text-shadow:none;}
    #gateway-control:hover {background:var(--ph-faint,#1e1404);border-color:var(--ph-dim,#b9791c);}
    #gateway-control[data-attention="true"] {color:var(--warn,#ffe97a);border-color:currentColor;}
    #gateway-control .gateway-dot {width:5px;height:5px;background:var(--ok,#7bc88a);flex-shrink:0;}
    #gateway-control[data-attention="true"] .gateway-dot {background:currentColor;}
    #gateway-control:focus-visible,#remote-review :is(button,summary):focus-visible {outline:2px solid var(--ph-bright,#ffd9a3);outline-offset:2px;}
    #remote-review {box-sizing:border-box;margin:auto;color:var(--text,#eec88f);background:var(--panel2,#0c0704);border:1px solid var(--ph-dim,#b9791c);padding:24px;width:500px;max-width:calc((100vw - 24px) * var(--sn-unzoom,1));max-height:calc((100dvh - 24px) * var(--sn-unzoom,1));overflow:auto;font:14px/1.5 monospace;border-radius:0;text-shadow:none;}
    #remote-review::backdrop {background:#000a;}
    #remote-review header {display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:16px;}
    #remote-review h2 {font:inherit;font-size:20px;color:var(--ph-bright,#ffd9a3);margin:0;}
    #remote-review p {margin:12px 0;overflow-wrap:anywhere;}
    #remote-review .gateway-state {margin:0;color:var(--ok,#7bc88a);}
    #remote-review[data-connected="false"] .gateway-state {color:var(--warn,#ffe97a);}
    #remote-review article,#remote-review details {border-top:1px solid var(--ph-dim,#b9791c);padding-top:16px;margin-top:16px;}
    #remote-review pre {white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;max-height:200px;overflow:auto;}
    #remote-review button {font:inherit;color:inherit;background:transparent;border:1px solid var(--ph-dim,#b9791c);padding:6px 10px;min-height:32px;cursor:pointer;border-radius:0;}
    #remote-review button:hover:not(:disabled) {background:var(--ph-faint,#1e1404);}
    #remote-review button:disabled {opacity:.5;cursor:default;}
    #remote-review article button + button {margin-left:8px;}
    #remote-review summary {cursor:pointer;}
    #gateway-announcement {position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;}
    @media(max-width:600px){#gateway-control{font-size:11px;padding:4px;}#remote-review{padding:16px;}}
  `;
  document.head.append(style);
  function text(tag, value, target) { const el = document.createElement(tag); el.textContent = value; target.append(el); return el; }
  const review = document.createElement('button'); review.id = 'gateway-control'; review.type = 'button';
  review.setAttribute('aria-haspopup', 'dialog'); review.setAttribute('aria-controls', 'remote-review');
  text('span', '', review).className = 'gateway-dot'; review.firstChild.setAttribute('aria-hidden', 'true');
  const label = text('span', 'Gateway', review);
  document.querySelector('#bottombar .bb-right')?.prepend(review);
  const announcement = document.createElement('span'); announcement.id = 'gateway-announcement'; announcement.setAttribute('role', 'status');
  document.body.append(announcement);
  const dialog = document.createElement('dialog'); dialog.id = 'remote-review'; dialog.setAttribute('aria-labelledby', 'gateway-title');
  document.body.append(dialog);
  const header = text('header', '', dialog);
  text('h2', 'Gateway', header).id = 'gateway-title';
  const close = text('button', 'Close', header); close.type = 'button'; close.onclick = () => dialog.close();
  const status = text('p', '', dialog); status.className = 'gateway-state';
  text('p', 'Your agents keep running when you close this app.', dialog);
  const activity = text('p', '', dialog);
  const recovery = text('p', '', dialog);
  const retry = text('button', 'Retry connection', dialog); retry.type = 'button'; retry.hidden = true;
  retry.onclick = () => connection === 'expired' ? window.location.reload() : poll();
  const goals = text('div', '', dialog); goals.style.whiteSpace = 'pre-line';
  const approvals = text('section', '', dialog); approvals.setAttribute('aria-label', 'Decisions');
  const details = text('details', '', dialog);
  text('summary', 'Connection details', details);
  const identity = text('p', 'Loading connection details…', details);
  const timing = text('p', '', details);
  let latest = null, pending = [], busy = false, latency = null, goalCursor = '';
  let connection = 'connecting', pendingSignature = '', opener = null;
  function setText(el, value) { if (el.textContent !== value) el.textContent = value; }
  function render() {
    const connected = connection === 'connected';
    const decisions = `${pending.length} decision${pending.length === 1 ? '' : 's'}`;
    const stateLabel = connected ? 'Connected' : connection === 'expired' ? 'Session needs refreshing' : 'Reconnecting';
    const compact = !connected ? (connection === 'expired' ? 'Reload needed' : 'Reconnecting') : pending.length ? decisions : '';
    setText(label, compact ? `Gateway · ${compact}` : 'Gateway');
    review.dataset.attention = String(!connected || pending.length > 0);
    review.setAttribute('aria-label', `Gateway: ${stateLabel.toLowerCase()}${pending.length ? ', ' + decisions : ''}`);
    setText(announcement, `${stateLabel}${pending.length ? ' · ' + decisions : ''}`);
    dialog.dataset.connected = String(connected);
    setText(status, stateLabel);
    setText(activity, latest ? `${connected ? '' : 'Last known: '}${latest.runs.length} running · ${pending.length} awaiting a decision` : 'Waiting for station activity.');
    setText(recovery, connection === 'expired' ? 'Reload to renew your session. Copy any unsent text first.' : !connected ? 'Reconnecting automatically. Station activity will catch up when the connection returns.' : '');
    recovery.hidden = connected;
    retry.hidden = connected;
    retry.textContent = connection === 'expired' ? 'Reload station' : 'Retry connection';
    retry.disabled = busy;
    setText(timing, latency === null ? 'Latency unavailable' : `${latency} ms round trip${connected ? '' : ' (last connection)'}`);
    setText(goals, (latest?.remote?.goals || []).map(row => `${row.goal.status} · ${row.goal.turnsUsed}/${row.goal.maxTurns} turns · ${row.goal.goal}`).join('\n'));
    approvals.hidden = pending.length === 0;
    goals.hidden = !(latest?.remote?.goals || []).length;
    const signature = JSON.stringify(pending);
    // Keep controls, keyboard focus and in-flight decisions intact during polls.
    if (signature !== pendingSignature) {
      pendingSignature = signature;
      const hadFocus = approvals.contains(document.activeElement);
      approvals.replaceChildren();
      for (const p of pending) {
        const article = text('article', '', approvals);
        text('strong', `${p.agentId || 'Agent'} · ${p.tool || 'Approval'}`, article);
        text('pre', p.argsSummary || 'Reopen the original session for this request.', article);
        if (p.tool === 'brief.ask' || p.tool === 'human.ask' || p.tool === 'path.trust') {
          text('p', 'Answer this request in its original session.', article); continue;
        }
        const buttons = [];
        const error = document.createElement('p'); error.setAttribute('role', 'alert'); error.hidden = true;
        for (const [buttonLabel, decision] of [['Allow once', 'once'], ['Deny', 'deny']]) {
          const button = text('button', buttonLabel, article); button.type = 'button'; buttons.push(button);
          button.onclick = async () => {
            article.dataset.busy = 'true'; buttons.forEach(b => { b.disabled = true; }); error.hidden = true;
            try {
              const r = await fetch('/api/consent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runId: p.runId, promptId: p.promptId, decision }), signal: AbortSignal.timeout(15000) });
              const result = await r.json();
              if (!r.ok || !result.ok) throw new Error('This request has expired or could not be applied.');
              pending = pending.filter(row => row.runId !== p.runId || row.promptId !== p.promptId);
              render(); await poll();
            } catch (_) { error.textContent = 'Decision could not be confirmed. Refresh the connection before trying again.'; error.hidden = false; }
            finally { article.dataset.busy = 'false'; buttons.forEach(b => { b.disabled = connection !== 'connected'; }); }
          };
        }
        article.append(error);
      }
      // If a resolved request disappears, keep focus inside the open dialog.
      if (hadFocus && dialog.open) close.focus();
    }
    for (const button of approvals.querySelectorAll('button')) button.disabled = !connected || button.closest('article').dataset.busy === 'true';
  }
  async function loadIdentity() {
    try {
      const r = await fetch('/remote/status', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error('disconnected');
      const remote = await r.json();
      identity.textContent = `${remote.host || 'Remote server'} · GitHub${remote.user?.login ? ' @' + remote.user.login : ''} · Headless execution`;
    } catch (_) { identity.textContent = 'Connection details unavailable. Reopen this panel to retry.'; }
  }
  function open() {
    if (!dialog.open) { opener = document.activeElement; render(); dialog.showModal(); }
    loadIdentity();
  }
  review.onclick = open;
  details.addEventListener('toggle', () => { if (details.open) loadIdentity(); });
  dialog.addEventListener('close', () => { if (opener?.isConnected && opener.offsetParent !== null) opener.focus(); });
  window.StarNetGateway = Object.freeze({ open });
  async function poll() {
    if (busy) return; busy = true;
    const started = performance.now();
    try {
      const r = await fetch('/api/state/snapshot', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (r.status === 403) { connection = 'expired'; return; }
      if (!r.ok) throw new Error('disconnected');
      latest = await r.json(); latency = Math.round(performance.now() - started);
      pending = latest.prompts || [];
      mirror.snapshot(latest);
      connection = 'connected';
      const canAdopt = () => !document.activeElement?.matches('textarea,input,[contenteditable="true"]')
        && (typeof Chat === 'undefined' || !Chat.canRefreshRemote || Chat.canRefreshRemote());
      if (canAdopt() && latest.runs.length === 0 && typeof CloudSave !== 'undefined' && CloudSave.refreshRemote
        && Number(latest.remote?.saveRevision) > CloudSave.revision()) {
        const saved = await CloudSave.refreshRemote(canAdopt);
        if (saved && typeof App !== 'undefined' && App.refreshRemoteSessions) App.refreshRemoteSessions(saved);
      }
      const nextGoals = JSON.stringify((latest.remote?.goals || []).map(g => [g.streamId, g.lastRunId, g.goal.status, g.goal.turnsUsed]));
      if (canAdopt() && latest.runs.length === 0 && nextGoals !== goalCursor && typeof Chat !== 'undefined' && Chat.refreshRemoteTranscript) {
        await Chat.refreshRemoteTranscript(); goalCursor = nextGoals;
      }
    } catch (_) { connection = 'reconnecting'; }
    finally { busy = false; render(); }
  }
  render(); poll(); setInterval(poll, 5000);
  window.addEventListener('online', poll);
});
