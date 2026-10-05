/* sidecar/account-choice.js — which connected sign-in a run starts on, and what each one has left.

   SUBSCRIPTION STACKING lets a provider (Claude Code, ChatGPT, Grok, Kimi) hold several signed-in accounts.
   index.js builds each run's account chain (the first entry starts the run, the rest are its in-run fallbacks);
   this module decides the ORDER of that chain and remembers what is known about every account:

     plan        — the account's subscription ("max", "pro", "plus" …), from the provider's own report
     windows     — usage windows ({ used: fraction of the cap, resetAt: ms }) from the provider's own usage report
     limitedUntil— the account hit its usage limit; it rests until then (the stated reset, or an hour)
     authFailed  — a real turn failed sign-in although a status check still said "signed in"

   RULES (station default, or per character):
     best   — ready accounts with the most usage left first: plan size × fraction of the cap still unused.
              An account whose usage is not known yet counts as unused, so it is tried and measured.
     order  — ready accounts in the order they were connected.
     prefer — one named account first while it is ready; the others follow in "best" order.
   Every rule keeps every account in the chain: a resting account (spent, or cooling after a failure) comes after
   the ready ones, soonest-available first, and an account whose sign-in failed comes last. Fallback never stops at
   the rule.

   PURE + deterministic: time arrives through the injected clock (lint-determinism); no I/O, no credential.
   Keys are the opaque credPool handles 'account:<provider>:<id|primary>'.

     makeAccountChoice({ clock }) -> { note, get, view, rank, forget, snapshot, restore, keys }
     normalizeRule(raw) -> { mode:'best'|'order' } | { mode:'prefer', key, provider } | null (inherit)
     ruleString(rule)   -> 'best' | 'order' | 'prefer:<provider>:<id|primary>' | ''
     planSize(provider, plan) -> relative allowance (1 = the provider's base paid plan; unknown = 1)
     parseCodexUsage(json, nowMs) / parseClaudeRateLimit(info, nowMs) -> a note() patch, or null */
'use strict';

const PROVIDERS = ['claude-cli', 'codex', 'grok', 'kimi'];
const KEY_RE = /^account:(claude-cli|codex|grok|kimi):(primary|[a-f0-9]{8,32})$/;
const RULE_MODES = ['best', 'order'];
const LIMIT_REST_MS = 60 * 60 * 1000;   // a spent account with no stated reset rests an hour (credPool's ceiling)
const MAX_ENTRIES = 64;
const MAX_WINDOWS = 6;

/* Approximate published allowances relative to each provider's base paid plan (Claude Pro, ChatGPT Plus), checked
   2026-10-05. Providers report the plan family only ("max", "pro"), not the tier inside it, so Max and Pro count
   as their smallest tier (5×). The size only weighs usage left between accounts of ONE provider. */
const PLAN_SIZE = Object.freeze({
  'claude-cli': Object.freeze({ free: 0, pro: 1, team: 1.25, enterprise: 1.25, max: 5 }),
  codex: Object.freeze({ free: 0.2, go: 0.5, plus: 1, team: 1, business: 1, edu: 1, enterprise: 1, pro: 5 })
});

function providerOfKey(key) { const m = KEY_RE.exec(String(key || '')); return m ? m[1] : ''; }
function finiteOr(v, d) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function epochMs(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n < 1e12 ? Math.round(n * 1000) : Math.round(n);   // epoch seconds or ms
}
function cleanPlan(plan) {
  const p = String(plan == null ? '' : plan).trim().toLowerCase().replace(/[^a-z0-9_ -]/g, '').slice(0, 40);
  return p || null;
}

function planSize(provider, plan) {
  const table = PLAN_SIZE[provider];
  const p = cleanPlan(plan);
  if (!table || !p) return 1;
  if (Object.prototype.hasOwnProperty.call(table, p)) return table[p];
  if (provider === 'claude-cli' && /max/.test(p)) return /20/.test(p) ? 20 : 5;
  return 1;
}

function normalizeRule(raw) {
  if (raw && typeof raw === 'object') raw = ruleString(raw);
  const s = String(raw == null ? '' : raw).trim().toLowerCase();
  if (!s) return null;
  if (RULE_MODES.indexOf(s) >= 0) return { mode: s };
  const m = /^prefer:(claude-cli|codex|grok|kimi):(primary|[a-f0-9]{8,32})$/.exec(s);
  if (m) return { mode: 'prefer', provider: m[1], key: 'account:' + m[1] + ':' + m[2] };
  return null;
}
function ruleString(rule) {
  if (!rule || typeof rule !== 'object') return '';
  if (rule.mode === 'prefer') {
    const m = KEY_RE.exec(String(rule.key || ''));
    return m ? 'prefer:' + m[1] + ':' + m[2] : '';
  }
  return RULE_MODES.indexOf(rule.mode) >= 0 ? rule.mode : '';
}

// ChatGPT's own usage report (GET /backend-api/wham/usage): plan_type + rate_limit.{primary,secondary}_window.
function parseCodexUsage(j, nowMs) {
  if (!j || typeof j !== 'object') return null;
  const out = { plan: cleanPlan(j.plan_type), windows: [], replaceWindows: true };
  const rl = (j.rate_limit && typeof j.rate_limit === 'object') ? j.rate_limit : null;
  if (rl) {
    for (const name of ['primary_window', 'secondary_window']) {
      const w = rl[name];
      if (!w || typeof w !== 'object' || !Number.isFinite(Number(w.used_percent))) continue;
      let resetAt = epochMs(w.reset_at);
      if (!resetAt && Number.isFinite(Number(w.reset_after_seconds))) resetAt = nowMs + Math.max(0, Number(w.reset_after_seconds)) * 1000;
      out.windows.push({ name: name === 'primary_window' ? 'primary' : 'secondary', used: Math.max(0, Number(w.used_percent)) / 100, resetAt });
    }
    if (rl.limit_reached === true || rl.allowed === false) {
      const spent = out.windows.filter(w => w.used >= 1 && w.resetAt > nowMs).map(w => w.resetAt);
      out.limited = true;
      out.limitedUntil = spent.length ? Math.max.apply(null, spent) : 0;
    } else if (rl.allowed === true) out.limited = false;
  }
  return out;
}

// Claude Code's stream-json rate_limit_event.rate_limit_info: status, resetsAt (epoch s), rateLimitType,
// utilization (fraction of the limiting window) and, when present, unifiedWindows (every window it tracks).
function parseClaudeRateLimit(info, nowMs) {
  if (!info || typeof info !== 'object') return null;
  const out = { windows: [] };
  if (Number.isFinite(Number(info.utilization)) && info.utilization !== null) {
    out.windows.push({ name: String(info.rateLimitType || 'current').slice(0, 40), used: Math.max(0, Number(info.utilization)), resetAt: epochMs(info.resetsAt) });
  }
  const uw = info.unifiedWindows;
  if (uw && typeof uw === 'object') {
    const entries = Array.isArray(uw) ? uw.map((v, i) => [String((v && (v.rateLimitType || v.type || v.name)) || i), v]) : Object.keys(uw).map(k => [k, uw[k]]);
    for (const [name, v] of entries) {
      if (!v || typeof v !== 'object' || !Number.isFinite(Number(v.utilization)) || v.utilization === null) continue;
      out.windows.push({ name: String(name).slice(0, 40), used: Math.max(0, Number(v.utilization)), resetAt: epochMs(v.resetsAt != null ? v.resetsAt : v.resets_at) });
    }
  }
  if (info.status === 'rejected') { out.limited = true; out.limitedUntil = epochMs(info.resetsAt); }
  else if (info.status === 'allowed' || info.status === 'allowed_warning') out.limited = false;
  if (!out.windows.length && out.limited === undefined) return null;
  return out;
}

function makeAccountChoice(opts) {
  opts = opts || {};
  const clock = opts.clock || { now() { return 0; } };
  const recs = new Map();   // key -> { plan, windows: {name: {used, resetAt}}, limitedUntil, authFailed, observedAt }

  function rec(key) {
    let r = recs.get(key);
    if (!r) { r = { plan: null, windows: {}, limitedUntil: 0, authFailed: false, observedAt: 0 }; recs.set(key, r); }
    return r;
  }
  function trim() {
    if (recs.size <= MAX_ENTRIES) return;
    const oldest = [...recs.entries()].sort((a, b) => a[1].observedAt - b[1].observedAt);
    for (let i = 0; i < oldest.length - MAX_ENTRIES; i++) recs.delete(oldest[i][0]);
  }

  // Returns true when what is known about the account CHANGED (the caller saves then); a repeat of the same facts
  // only refreshes observedAt.
  function note(key, patch) {
    if (!KEY_RE.test(String(key || '')) || !patch || typeof patch !== 'object') return false;
    const now = clock.now();
    const had = recs.has(key);
    const r = rec(key);
    const before = JSON.stringify([r.plan, r.windows, r.limitedUntil, r.authFailed]);
    if (patch.plan !== undefined) { const p = cleanPlan(patch.plan); if (p) r.plan = p; }
    if (Array.isArray(patch.windows)) {
      const next = patch.replaceWindows ? {} : Object.assign({}, r.windows);
      for (const w of patch.windows) {
        if (!w || typeof w !== 'object') continue;
        const used = finiteOr(w.used, NaN);
        if (!Number.isFinite(used) || used < 0) continue;
        next[String(w.name || 'current').slice(0, 40)] = { used: Math.min(used, 10), resetAt: epochMs(w.resetAt) };
      }
      const names = Object.keys(next).slice(-MAX_WINDOWS);
      r.windows = {};
      for (const n of names) r.windows[n] = next[n];
    }
    if (patch.limited === true) {
      const until = epochMs(patch.limitedUntil);
      r.limitedUntil = until > now ? until : now + LIMIT_REST_MS;
    } else if (patch.limited === false) r.limitedUntil = 0;
    if (typeof patch.authFailed === 'boolean') r.authFailed = patch.authFailed;
    r.observedAt = now;
    trim();
    return !had || JSON.stringify([r.plan, r.windows, r.limitedUntil, r.authFailed]) !== before;
  }

  function usedFraction(r, now) {
    let used = null;
    for (const n of Object.keys(r.windows)) {
      const w = r.windows[n];
      if (w.resetAt && w.resetAt <= now) continue;   // that window has reset since it was read
      used = used == null ? w.used : Math.max(used, w.used);
    }
    return used;
  }
  function bindingReset(r, now) {
    let best = null;
    for (const n of Object.keys(r.windows)) {
      const w = r.windows[n];
      if (!w.resetAt || w.resetAt <= now) continue;
      if (!best || w.used > best.used) best = w;
    }
    return best ? best.resetAt : 0;
  }

  function get(key) { const r = recs.get(key); return r ? JSON.parse(JSON.stringify(r)) : null; }

  // what Settings shows for one account: plan, % used (null = not reported yet), when the fullest window resets
  function view(key) {
    const provider = providerOfKey(key);
    const r = recs.get(key);
    const now = clock.now();
    if (!r) return { plan: null, size: planSize(provider, null), usedPct: null, resetAt: 0, limitedUntil: 0, authFailed: false, observedAt: 0 };
    const used = usedFraction(r, now);
    return {
      plan: r.plan,
      size: planSize(provider, r.plan),
      usedPct: used == null ? null : Math.max(0, Math.min(100, Math.round(used * 100))),
      resetAt: bindingReset(r, now),
      limitedUntil: r.limitedUntil > now ? r.limitedUntil : 0,
      authFailed: !!r.authFailed,
      observedAt: r.observedAt
    };
  }

  // headroom = plan size × fraction of the cap still unused (unknown usage counts as unused)
  function headroom(key, now) {
    const r = recs.get(key);
    const provider = providerOfKey(key);
    if (!r) return planSize(provider, null);
    const used = usedFraction(r, now);
    const left = used == null ? 1 : Math.max(0, 1 - used);
    return planSize(provider, r.plan) * left;
  }

  /* chain: [{ credKey, ... }] in connection order. opts: { rule, coolingUntil(key) -> ms }.
     Returns the same objects in run order: ready (by rule), resting (soonest first), sign-in failed (last). */
  function rank(chain, o) {
    o = o || {};
    const list = Array.isArray(chain) ? chain.filter(a => a && typeof a.credKey === 'string') : [];
    if (list.length < 2) return list.slice();
    const now = clock.now();
    const rule = (o.rule && typeof o.rule === 'object') ? o.rule : (normalizeRule(o.rule) || { mode: 'best' });
    const cooling = typeof o.coolingUntil === 'function' ? o.coolingUntil : () => 0;
    const rows = list.map((a, index) => {
      const r = recs.get(a.credKey);
      const restUntil = Math.max(finiteOr(cooling(a.credKey), 0), r && r.limitedUntil > now ? r.limitedUntil : 0);
      const state = (r && r.authFailed) ? 2 : (restUntil > now ? 1 : 0);
      return { a, index, state, restUntil, score: headroom(a.credKey, now) };
    });
    const byBest = (x, y) => (y.score - x.score) || (x.index - y.index);
    const ready = rows.filter(x => x.state === 0);
    if (rule.mode === 'order') ready.sort((x, y) => x.index - y.index);
    else ready.sort(byBest);
    if (rule.mode === 'prefer') {
      const at = ready.findIndex(x => x.a.credKey === rule.key);
      if (at > 0) ready.unshift(ready.splice(at, 1)[0]);
    }
    const resting = rows.filter(x => x.state === 1).sort((x, y) => (x.restUntil - y.restUntil) || (x.index - y.index));
    const failed = rows.filter(x => x.state === 2).sort((x, y) => x.index - y.index);
    return ready.concat(resting, failed).map(x => x.a);
  }

  function forget(key) { return recs.delete(key); }
  function keys() { return [...recs.keys()]; }
  function snapshot(keep) {
    const out = {};
    for (const [k, r] of recs) {
      if (typeof keep === 'function' && !keep(k)) continue;
      out[k] = { plan: r.plan, windows: r.windows, limitedUntil: r.limitedUntil, authFailed: r.authFailed, observedAt: r.observedAt };
    }
    return out;
  }
  function restore(obj) {
    if (!obj || typeof obj !== 'object') return 0;
    let n = 0;
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (!KEY_RE.test(k) || !v || typeof v !== 'object') continue;
      const windows = {};
      if (v.windows && typeof v.windows === 'object') {
        for (const name of Object.keys(v.windows).slice(-MAX_WINDOWS)) {
          const w = v.windows[name];
          const used = finiteOr(w && w.used, NaN);
          if (Number.isFinite(used) && used >= 0) windows[String(name).slice(0, 40)] = { used: Math.min(used, 10), resetAt: epochMs(w.resetAt) };
        }
      }
      recs.set(k, { plan: cleanPlan(v.plan), windows, limitedUntil: epochMs(v.limitedUntil), authFailed: v.authFailed === true, observedAt: finiteOr(v.observedAt, 0) });
      n++;
    }
    trim();
    return n;
  }

  return { note, get, view, rank, forget, keys, snapshot, restore };
}

module.exports = { makeAccountChoice, normalizeRule, ruleString, planSize, parseCodexUsage, parseClaudeRateLimit, providerOfKey, PROVIDERS, RULE_MODES, LIMIT_REST_MS };

