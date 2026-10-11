'use strict';
// RAILS: one room per channel, one rail per video, one stop per pipeline step. Read-only view of the external
// production pipeline's manifests (GET /api/autopilot/rails). It shows only what the manifests say; a failed
// read is shown as a failed read, never as an empty station.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RemoteRails = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const LABEL = { done: 'done', running: 'running', failed: 'failed', review: 'waiting for Lev', pending: 'queued', skipped: 'skipped', unknown: 'unknown' };
  const GLYPH = { done: '●', running: '◉', failed: '✕', review: '◆', pending: '○', skipped: '–', unknown: '?' };

  function ago(ms, now) {
    if (!ms) return '';
    const s = Math.max(0, Math.round(((now || Date.now()) - ms) / 1000));
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.round(s / 60) + 'm ago';
    if (s < 86400) return Math.round(s / 3600) + 'h ago';
    return Math.round(s / 86400) + 'd ago';
  }
  // A plain summary for the dock button: how many rails are moving, waiting or failed.
  function summary(data) {
    const counts = { running: 0, review: 0, failed: 0, total: 0 };
    for (const c of (data && data.channels) || []) for (const r of c.runs || []) {
      counts.total++;
      if (counts[r.status] != null) counts[r.status]++;
    }
    return counts;
  }
  function buttonLabel(data) {
    const c = summary(data);
    const bits = [];
    if (c.failed) bits.push(c.failed + ' failed');
    if (c.review) bits.push(c.review + ' waiting');
    if (c.running) bits.push(c.running + ' moving');
    return bits.length ? 'Rails · ' + bits.join(' · ') : 'Rails';
  }

  // Render into `body` (a DOM element) with document `doc`. Pure DOM building; no fetches.
  function render(doc, body, data, now) {
    body.replaceChildren();
    const el = (tag, cls, text, parent) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; (parent || body).append(e); return e; };
    if (!data) { el('p', 'rails-note', 'Loading rails…'); return; }
    if (!data.ok) {
      el('p', 'rails-note', data.error || 'The rails could not be read.');
      el('p', 'rails-note dim', 'Source: ' + (data.root || 'unknown') + '/runs/<id>/run.json');
      return;
    }
    const channels = data.channels || [];
    if (!channels.length) el('p', 'rails-note', 'No videos in production yet.');
    for (const ch of channels) {
      const room = el('section', 'rails-room');
      room.setAttribute('aria-label', 'Room ' + ch.id);
      el('h3', 'rails-room-title', 'ROOM · ' + String(ch.id).toUpperCase(), room);
      for (const run of ch.runs || []) {
        const card = el('article', 'rails-run', null, room);
        card.dataset.status = run.status;
        const head = el('div', 'rails-run-head', null, card);
        el('span', 'rails-run-title', run.title || run.id, head);
        const chip = el('span', 'rails-chip', LABEL[run.status] || run.status, head);
        chip.dataset.status = run.status;
        const rail = el('ol', 'rails-track', null, card);
        rail.setAttribute('aria-label', 'Steps for ' + (run.title || run.id));
        for (const step of run.steps || []) {
          const stop = el('li', 'rails-stop', null, rail);
          stop.dataset.status = step.status;
          el('span', 'rails-dot', GLYPH[step.status] || '?', stop).setAttribute('aria-hidden', 'true');
          el('span', 'rails-step', step.name, stop);
          stop.title = step.name + ': ' + (LABEL[step.status] || step.status) + (step.note ? ' — ' + step.note : '');
          stop.setAttribute('aria-label', stop.title);
        }
        const notes = (run.steps || []).filter(s => s.note && (s.status === 'failed' || s.status === 'running' || s.status === 'review'));
        for (const s of notes.slice(0, 2)) el('p', 'rails-run-note', s.name + ': ' + s.note, card);
        el('p', 'rails-run-meta dim', run.id + (run.updatedAt ? ' · updated ' + ago(run.updatedAt, now) : ''), card);
      }
    }
    for (const e of (data.errors || []).slice(0, 5)) el('p', 'rails-note bad', e.run + ': ' + e.error);
  }

  function mount(win, doc) {
    if (!win || !doc || !win.__STARNET_REMOTE__ || doc.getElementById('rails-control')) return null;
    const button = doc.createElement('button');
    button.id = 'rails-control'; button.className = 'bb sm'; button.type = 'button';
    button.setAttribute('aria-haspopup', 'dialog'); button.setAttribute('aria-controls', 'rails-panel');
    button.textContent = 'Rails';
    const bar = doc.querySelector('#bottombar .bb-right');
    if (bar) bar.prepend(button); else doc.body.append(button);
    const dialog = doc.createElement('dialog');
    dialog.id = 'rails-panel'; dialog.className = 'term sn-menu'; dialog.setAttribute('aria-labelledby', 'rails-title');
    const header = doc.createElement('header'); header.className = 'term-head';
    const title = doc.createElement('span'); title.id = 'rails-title'; title.className = 'term-title'; title.textContent = 'RAILS';
    const refresh = doc.createElement('button'); refresh.className = 'bb sm rails-refresh'; refresh.type = 'button'; refresh.textContent = '↻';
    refresh.setAttribute('aria-label', 'Refresh rails');
    const close = doc.createElement('button'); close.className = 'term-x'; close.type = 'button'; close.textContent = '×';
    close.setAttribute('aria-label', 'Close rails');
    header.append(title, refresh, close);
    const body = doc.createElement('div'); body.className = 'term-body';
    dialog.append(header, body);
    doc.body.append(dialog);
    let data = null, timer = null, inflight = null;
    async function load() {
      if (inflight) return inflight;
      inflight = (async () => {
        try {
          const r = await win.fetch('/api/autopilot/rails', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
          data = r.ok ? await r.json() : { ok: false, error: 'The station answered ' + r.status + ' for the rails.' };
        } catch (e) {
          data = { ok: false, error: 'The rails could not be reached (' + ((e && e.message) || e) + ').' };
        }
        button.textContent = buttonLabel(data);
        button.dataset.attention = String(summary(data).failed > 0 || summary(data).review > 0);
        if (dialog.open) render(doc, body, data, Date.now());
      })().finally(() => { inflight = null; });
      return inflight;
    }
    button.onclick = () => { render(doc, body, data, Date.now()); dialog.showModal(); load(); };
    refresh.onclick = () => load();
    close.onclick = () => dialog.close();
    load();
    timer = win.setInterval(() => { if (!doc.hidden) load(); }, 15000);
    return { load, stop: () => win.clearInterval(timer) };
  }

  if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => { try { mount(window, document); } catch (e) { console.warn('[rails] mount failed', e); } });
  }
  return { render, summary, buttonLabel, ago, mount };
});
