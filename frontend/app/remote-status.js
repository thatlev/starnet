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
  style.textContent = `
    #remote-station-status { position:fixed;bottom:8px;left:12px;z-index:10000;display:flex;gap:10px;align-items:center;background:#17191e;color:#e9c77b;border:1px solid #8e774b;padding:7px 10px;font:13px monospace;max-width:calc(100vw - 24px);box-sizing:border-box; }
    #remote-station-status button,#remote-review button {font:inherit;color:inherit;background:#282a30;border:1px solid #8e774b;padding:5px 8px;cursor:pointer;border-radius:0;}
    #remote-station-status button:focus-visible,#remote-review button:focus-visible {outline:2px solid #ffe5a0;outline-offset:2px;}
    #remote-review {color:#eee;background:#17191e;border:1px solid #8e774b;padding:20px;max-width:560px;width:calc(100vw - 40px);max-height:80vh;font:14px/1.5 monospace;border-radius:0;}
    #remote-review::backdrop {background:#000a;} #remote-review article {border-top:1px solid #555;padding:12px 0;}
    #remote-review pre {white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;} #remote-review button {margin:4px;}
    @media(max-width:600px){#remote-station-status{font-size:11px;gap:6px;} }
  `;
  document.head.append(style);
  const bar = document.createElement('aside'); bar.id = 'remote-station-status';
  bar.setAttribute('aria-label', 'Remote station connection');
  const status = document.createElement('span'); status.textContent = 'Connecting to LevServer…'; status.setAttribute('role', 'status');
  const review = document.createElement('button'); review.type = 'button'; review.textContent = 'Details';
  bar.append(status, review); document.body.append(bar);
  const dialog = document.createElement('dialog'); dialog.id = 'remote-review'; dialog.setAttribute('aria-label', 'LevServer connection and approvals');
  document.body.append(dialog);
  let latest = null, pending = [], busy = false, latency = null, goalCursor = '';
  function text(tag, value, target = dialog) { const el = document.createElement(tag); el.textContent = value; target.append(el); return el; }
  function render() {
    dialog.replaceChildren();
    text('h2', 'Your station runs on LevServer');
    text('p', 'Closing this app disconnects the viewer. Your agents keep running within their existing permissions and budgets.');
    text('p', latest ? `${latest.runs.length} running · ${pending.length} awaiting a decision · ${latency} ms round trip` : 'Connection unavailable. The last known state may be out of date.');
    for (const row of latest?.remote?.goals || []) {
      text('p', `${row.goal.status} · ${row.goal.turnsUsed}/${row.goal.maxTurns} turns · ${row.goal.goal}`);
    }
    for (const p of pending) {
      const article = document.createElement('article'); dialog.append(article);
      text('strong', `${p.agentId || 'Agent'} · ${p.tool || 'Approval'}`, article);
      text('pre', p.argsSummary || 'Reopen the original session for this request.', article);
      // Clarification requires a text answer, not a generic tool approval.
      if (p.tool === 'brief.ask' || p.tool === 'human.ask' || p.tool === 'path.trust') {
        text('p', 'Answer this request in its original session.', article); continue;
      }
      for (const [label, decision] of [['Allow once', 'once'], ['Deny', 'deny']]) {
        const button = text('button', label, article); button.type = 'button';
        button.onclick = async () => {
          button.disabled = true;
          try {
            const r = await fetch('/api/consent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runId: p.runId, promptId: p.promptId, decision }) });
            const result = await r.json();
            if (!r.ok || !result.ok) throw new Error('This request has expired or could not be applied.');
            await poll(); render();
          } catch (e) { text('p', e.message, article); button.disabled = false; }
        };
      }
    }
    const close = text('button', 'Close'); close.type = 'button'; close.onclick = () => dialog.close();
  }
  review.onclick = () => { render(); dialog.showModal(); };
  async function poll() {
    if (busy) return; busy = true;
    const started = performance.now();
    try {
      const r = await fetch('/api/state/snapshot', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (r.status === 403) { status.textContent = 'Server restarted · reload to reconnect'; return; }
      if (!r.ok) throw new Error('disconnected');
      latest = await r.json(); latency = Math.round(performance.now() - started);
      pending = latest.prompts || [];
      mirror.snapshot(latest);
      status.textContent = `● LevServer · ${latency} ms · ${latest.runs.length} running`;
      review.textContent = pending.length ? `${pending.length} decision${pending.length === 1 ? '' : 's'}` : 'Details';
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
    } catch (_) { latest = null; status.textContent = 'Reconnecting · work stays on LevServer'; }
    finally { busy = false; }
  }
  poll(); setInterval(poll, 5000);
  window.addEventListener('online', poll);
});
