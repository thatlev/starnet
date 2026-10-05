/* node test/account-choice.test.js — which connected sign-in a run starts on (sidecar/account-choice.js).

   Pure module, fake clock: rules (best / order / prefer), usage parsing from ChatGPT's usage report and Claude
   Code's rate_limit_event, rests after a usage limit, failed sign-ins, window resets and persistence. */
'use strict';
const A = require('./_assert.js');
const AC = require('../sidecar/account-choice.js');

let now = 1_800_000_000_000;
const clock = { now: () => now };
const k = (p, id) => 'account:' + p + ':' + (id || 'primary');
const chain = (p, ids) => ids.map((id, i) => ({ id, credKey: k(p, id), label: 'account ' + (i + 1) }));
const ids = list => list.map(a => a.id || 'primary');

// rules
A.eq(AC.normalizeRule(''), null, 'an empty rule inherits the station rule');
A.eq(AC.normalizeRule('BEST'), { mode: 'best' }, 'best (any case)');
A.eq(AC.normalizeRule('order'), { mode: 'order' }, 'order');
A.eq(AC.normalizeRule('prefer:claude-cli:abcdef12'), { mode: 'prefer', provider: 'claude-cli', key: 'account:claude-cli:abcdef12' }, 'prefer names one account');
A.eq(AC.normalizeRule('prefer:codex:primary'), { mode: 'prefer', provider: 'codex', key: 'account:codex:primary' }, 'prefer the primary sign-in');
A.eq(AC.normalizeRule('prefer:codex:../x'), null, 'a forged account id is no rule');
A.eq(AC.normalizeRule('prefer:openrouter:primary'), null, 'only stacked sign-in providers');
A.eq(AC.ruleString(AC.normalizeRule('prefer:kimi:feed1234')), 'prefer:kimi:feed1234', 'rule strings round-trip');
A.eq(AC.ruleString(null), '', 'no rule -> empty string');

// plan sizes
A.eq([AC.planSize('claude-cli', 'pro'), AC.planSize('claude-cli', 'max'), AC.planSize('claude-cli', 'max_20x'), AC.planSize('claude-cli', 'weird')], [1, 5, 20, 1], 'Claude plans');
A.eq([AC.planSize('codex', 'plus'), AC.planSize('codex', 'pro'), AC.planSize('codex', 'free'), AC.planSize('grok', 'anything')], [1, 5, 0.2, 1], 'ChatGPT plans; unknown providers count as 1');

// ChatGPT usage report (the live /wham/usage shape)
const codexReport = { plan_type: 'pro', rate_limit: { allowed: true, limit_reached: false,
  primary_window: { used_percent: 44, limit_window_seconds: 604800, reset_after_seconds: 394635, reset_at: 1791580511 }, secondary_window: null } };
const cp = AC.parseCodexUsage(codexReport, now);
A.eq(cp.plan, 'pro', 'plan_type -> plan');
A.eq(cp.windows, [{ name: 'primary', used: 0.44, resetAt: 1791580511000 }], 'used_percent -> fraction; reset_at seconds -> ms');
A.eq(cp.limited, false, 'allowed -> not resting');
const spent = AC.parseCodexUsage({ plan_type: 'plus', rate_limit: { allowed: false, limit_reached: true, primary_window: { used_percent: 100, reset_after_seconds: 3600 } } }, now);
A.eq([spent.limited, spent.limitedUntil], [true, now + 3600000], 'a reached limit rests until the spent window resets');
A.eq(AC.parseCodexUsage(null, now), null, 'no report -> nothing');

// Claude Code rate_limit_event.rate_limit_info
const cl = AC.parseClaudeRateLimit({ status: 'allowed_warning', resetsAt: 1800003600, rateLimitType: 'five_hour', utilization: 0.82,
  unifiedWindows: { seven_day: { utilization: 0.4, resetsAt: 1800400000 } } }, now);
A.eq(cl.windows, [{ name: 'five_hour', used: 0.82, resetAt: 1800003600000 }, { name: 'seven_day', used: 0.4, resetAt: 1800400000000 }], 'utilization + every unified window');
A.eq(cl.limited, false, 'allowed_warning is still allowed');
const rej = AC.parseClaudeRateLimit({ status: 'rejected', resetsAt: 1800007200, rateLimitType: 'seven_day' }, now);
A.eq([rej.limited, rej.limitedUntil], [true, 1800007200000], 'rejected rests until resetsAt');
A.eq(AC.parseClaudeRateLimit({ status: 'mystery' }, now), null, 'an event with nothing usable -> nothing');

// ranking
{
  const c = AC.makeAccountChoice({ clock });
  const three = chain('claude-cli', ['', 'aaaaaaa1', 'aaaaaaa2']);
  A.eq(ids(c.rank(three, { rule: 'best' })), ['primary', 'aaaaaaa1', 'aaaaaaa2'], 'nothing known: connection order');
  c.note(k('claude-cli'), { plan: 'max', windows: [{ name: 'five_hour', used: 0.9, resetAt: now + 3600000 }] });
  c.note(k('claude-cli', 'aaaaaaa1'), { plan: 'pro', windows: [{ name: 'five_hour', used: 0.1, resetAt: now + 3600000 }] });
  // headroom: primary 5×0.1 = 0.5 · a1 1×0.9 = 0.9 · a2 unknown = 1 (plan unknown, unused)
  A.eq(ids(c.rank(three, { rule: 'best' })), ['aaaaaaa2', 'aaaaaaa1', 'primary'], 'best: most usage left (plan size × unused share)');
  c.note(k('claude-cli', 'aaaaaaa2'), { plan: 'max', windows: [{ name: 'five_hour', used: 0.5, resetAt: now + 3600000 }] });
  A.eq(ids(c.rank(three, { rule: 'best' })), ['aaaaaaa2', 'aaaaaaa1', 'primary'], 'a bigger plan half used still beats a small one nearly unused (2.5 > 0.9)');
  A.eq(ids(c.rank(three, { rule: 'order' })), ['primary', 'aaaaaaa1', 'aaaaaaa2'], 'order: connection order');
  A.eq(ids(c.rank(three, { rule: 'prefer:claude-cli:primary' })), ['primary', 'aaaaaaa2', 'aaaaaaa1'], 'prefer: that account first, the rest by best');
  A.eq(ids(c.rank(three, { rule: 'prefer:codex:primary' })), ['aaaaaaa2', 'aaaaaaa1', 'primary'], 'prefer for another provider: best');
  // a window that reset counts as unused again
  now += 3600001;
  A.eq(ids(c.rank(three, { rule: 'best' })), ['primary', 'aaaaaaa2', 'aaaaaaa1'], 'after the windows reset, the biggest plans lead again (connection order breaks the tie)');
  A.eq(c.view(k('claude-cli')).usedPct, null, 'a reset window no longer reports usage');
  // rests
  c.note(k('claude-cli'), { limited: true, limitedUntil: now + 7 * 24 * 3600000 });
  c.note(k('claude-cli', 'aaaaaaa2'), { limited: true });
  const cooling = key => key === k('claude-cli', 'aaaaaaa1') ? now + 120000 : 0;
  A.eq(ids(c.rank(three, { rule: 'best', coolingUntil: cooling })), ['aaaaaaa1', 'aaaaaaa2', 'primary'],
    'every account resting: soonest back first (credPool 2 min < an hour < a week)');
  A.eq(ids(c.rank(three, { rule: 'prefer:claude-cli:primary' })), ['aaaaaaa1', 'aaaaaaa2', 'primary'], 'a resting preferred account waits behind ready ones');
  A.ok(c.view(k('claude-cli')).limitedUntil > now + 6 * 24 * 3600000, 'a weekly limit rests past credPool\'s one-hour ceiling');
  A.eq(c.view(k('claude-cli', 'aaaaaaa2')).limitedUntil, now + AC.LIMIT_REST_MS, 'no stated reset: an hour');
  c.note(k('claude-cli', 'aaaaaaa2'), { limited: false });
  c.note(k('claude-cli', 'aaaaaaa1'), { authFailed: true });
  A.eq(ids(c.rank(three, { rule: 'order' })), ['aaaaaaa2', 'primary', 'aaaaaaa1'], 'a failed sign-in goes last, after resting accounts');
  A.eq(c.view(k('claude-cli', 'aaaaaaa1')).authFailed, true, 'and Settings sees it');
  c.note(k('claude-cli', 'aaaaaaa1'), { authFailed: false });
  A.eq(c.view(k('claude-cli', 'aaaaaaa1')).authFailed, false, 'a new sign-in clears it');
  A.eq(c.rank(chain('codex', ['']), { rule: 'best' }).length, 1, 'one account: nothing to order');
  A.eq(c.note(k('claude-cli', 'aaaaaaa1'), { plan: 'pro' }), false, 'a repeat of known facts is no change (nothing to save)');
  A.eq(c.note(k('claude-cli', 'aaaaaaa1'), { plan: 'max' }), true, 'a new plan is a change');
  A.eq(c.note(k('codex', 'bbbbbbb1'), {}), true, 'a first record is a change');
  A.eq(c.note('account:codex:../../x', { plan: 'pro' }), false, 'a forged key records nothing');
  A.eq(c.note('openrouter-key', { plan: 'pro' }), false, 'an API key handle records nothing');

  // persistence round-trip (only existing accounts are kept)
  const snap = c.snapshot(key => key !== k('claude-cli', 'aaaaaaa2'));
  A.ok(!JSON.stringify(snap).includes('aaaaaaa2'), 'the snapshot drops accounts that no longer exist');
  const d = AC.makeAccountChoice({ clock });
  A.eq(d.restore(JSON.parse(JSON.stringify(snap))), 3, 'restore reads the saved accounts');
  A.eq(d.view(k('claude-cli')).limitedUntil, c.view(k('claude-cli')).limitedUntil, 'a weekly rest survives a restart');
  A.eq(d.view(k('claude-cli')).plan, 'max', 'the plan survives a restart');
  A.eq(d.restore({ 'account:codex:../x': { plan: 'pro' }, junk: 1 }), 0, 'restore ignores forged keys and junk');
}

A.report('account-choice.test');

