/* node test/account-choice.e2e.test.js — which connected sign-in a run starts on, end to end (account-choice.js).

   Boots the real sidecar with STARNET_CLAUDE_BIN pointing at a FAKE claude (as subscription-stacking.e2e does) that
   reports each identity's usage on the stream the way Claude Code does (rate_limit_event), and with two ChatGPT
   sign-ins whose usage a local fake of the ChatGPT usage report answers per token.

   Proves: the station rule BEST starts a run on the account with the most usage left (and an account never measured
   is tried and measured); ORDER restores connection order; a character's own PREFER rule wins for its runs; a real
   sign-in failure (the CLI's authentication_failed) fails over in the same run, is shown as needing a new sign-in and
   sends that account last until SIGN IN clears it; the rule and what was learned survive a restart; ChatGPT accounts
   carry their plan and usage left from the report and the run starts on the bigger headroom. No real service is
   contacted. */
'use strict';

const A = require('./_assert.js');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { bootToken } = require('./_httpToken.js');

const HOST = '127.0.0.1';
const INDEX = path.resolve(__dirname, '..', 'sidecar', 'index.js');

const FAKE_CLI = String.raw`'use strict';
const fs = require('fs'), path = require('path');
const args = process.argv.slice(2);
const dir = process.env.CLAUDE_CONFIG_DIR || '';
const who = dir ? path.basename(dir) : 'primary';
const log = line => fs.appendFileSync(process.env.FAKE_CLAUDE_LOG, line + '\n');
const out = o => process.stdout.write(JSON.stringify(o) + '\n');
const authFail = () => { try { return fs.readFileSync(process.env.FAKE_CLAUDE_AUTHFAIL, 'utf8').split('\n').includes(who); } catch (_) { return false; } };
if (args[0] === 'auth') {
  log(who + ' auth ' + args[1]);
  if (args[1] === 'login') { try { const l = fs.readFileSync(process.env.FAKE_CLAUDE_AUTHFAIL, 'utf8').split('\n').filter(x => x && x !== who); fs.writeFileSync(process.env.FAKE_CLAUDE_AUTHFAIL, l.join('\n')); } catch (_) {} }
  if (args[1] === 'status') out({ loggedIn: true, authMethod: 'claude.ai', email: who + '@example.test', subscriptionType: who === 'primary' ? 'max' : 'pro' });
  process.exit(0);
}
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', d => { input += d; });
process.stdin.on('end', () => {
  const marker = (input.match(/CHOICE-E2E-[A-Z0-9]+/) || ['?'])[0];
  log(who + ' run ' + marker);
  out({ type: 'system', subtype: 'init', apiKeySource: 'none', tools: [] });
  const usage = { input_tokens: 3, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 2 };
  if (authFail()) {
    const text = 'Failed to authenticate: OAuth session expired and could not be refreshed';
    out({ type: 'assistant', error: 'authentication_failed', message: { content: [{ type: 'text', text }] } });
    out({ type: 'result', subtype: 'success', is_error: true, result: text, usage, total_cost_usd: 0 });
    return;
  }
  // the primary (Max) is 96% through its window, every other identity (Pro) 10%
  const used = who === 'primary' ? 0.96 : 0.1;
  out({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', resetsAt: Math.floor(Date.now() / 1000) + 3600, rateLimitType: 'five_hour', utilization: used } });
  const text = 'answered by ' + who;
  out({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } } });
  out({ type: 'result', subtype: 'success', is_error: false, result: text, stop_reason: 'end_turn', usage, total_cost_usd: 0 });
});
`;

function makeFakeClaude(root) {
  const pkg = path.join(root, 'node_modules', '@anthropic-ai', 'claude-code');
  fs.mkdirSync(pkg, { recursive: true });
  fs.writeFileSync(path.join(pkg, 'cli.js'), FAKE_CLI);
  const shim = path.join(root, 'claude.cmd');
  fs.writeFileSync(shim, '@echo off\r\n');   // never executed: claude-cli.js runs the cli.js beside a .cmd shim
  return shim;
}

const jwt = (who, plan) => 'fixture.' + Buffer.from(JSON.stringify({ exp: 4102444800, 'https://api.openai.com/profile': { email: who + '@example.test' }, 'https://api.openai.com/auth': { chatgpt_plan_type: plan } })).toString('base64url') + '.fixture';
const CODEX_A = jwt('codex-a', 'plus'), CODEX_B = jwt('codex-b', 'pro');
const CODEX_ACCT = 'c0ffee12';

function startMock() {
  const calls = [];
  const usageCalls = [];
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      let raw = '';
      req.on('data', c => { raw += c; });
      req.on('end', () => {
        const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
        const who = bearer === CODEX_A ? 'codex-a' : bearer === CODEX_B ? 'codex-b' : 'unknown';
        if (req.method === 'GET' && req.url === '/wham/usage') {
          usageCalls.push(who);
          // Plus 20% used (headroom 0.8) vs Pro 50% used (headroom 5 × 0.5 = 2.5)
          const used = who === 'codex-a' ? 20 : 50;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ plan_type: who === 'codex-a' ? 'plus' : 'pro', email: who + '@example.test',
            rate_limit: { allowed: true, limit_reached: false, primary_window: { used_percent: used, limit_window_seconds: 18000, reset_after_seconds: 7200, reset_at: Math.floor(Date.now() / 1000) + 7200 }, secondary_window: null } }));
          return;
        }
        if (req.method !== 'POST') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ models: [], data: [] })); return; }
        calls.push({ who, marker: (raw.match(/CHOICE-E2E-[A-Z0-9]+/) || ['?'])[0] });
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        const send = o => res.write('data: ' + JSON.stringify(o) + '\n\n');
        send({ type: 'response.output_text.delta', delta: 'answered by ' + who });
        send({ type: 'response.completed', response: { status: 'completed', usage: { input_tokens: 5, output_tokens: 3 } } });
        res.end('data: [DONE]\n\n');
      });
    });
    server.listen(0, HOST, () => resolve({ server, calls, usageCalls, base: 'http://' + HOST + ':' + server.address().port }));
  });
}

function boot(port, env, attemptsLeft) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [INDEX], { env: Object.assign({}, process.env, env, { SKYNET_PORT: String(port) }), stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', settled = false;
    const onData = (data) => {
      output += data.toString();
      if (!settled && output.includes('http://' + HOST + ':' + port)) { settled = true; resolve({ child, port }); }
      else if (!settled && /already in use/i.test(output)) {
        settled = true;
        try { child.kill(); } catch (_) {}
        if (attemptsLeft > 0) resolve(boot(port + 1, env, attemptsLeft - 1)); else reject(new Error('no free port'));
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (error) => { if (!settled) { settled = true; reject(error); } });
    setTimeout(() => { if (!settled) { settled = true; try { child.kill(); } catch (_) {} reject(new Error('boot timeout:\n' + output)); } }, 15000);
  });
}

(async () => {
  const mock = await startMock();
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'starnet-account-choice-'));
  const fakeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'starnet-fakeclaude-choice-'));
  const logFile = path.join(fakeRoot, 'calls.log'), failFile = path.join(fakeRoot, 'authfail.txt');
  fs.writeFileSync(logFile, ''); fs.writeFileSync(failFile, '');
  // two ChatGPT sign-ins: the primary (Plus) and one extra account (Pro)
  fs.mkdirSync(path.join(workspace, 'codex'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'codex', 'tokens.json'), JSON.stringify({ access_token: CODEX_A, refresh_token: 'fixture-a', token_type: 'Bearer' }));
  const codexDir = path.join(workspace, '.secrets', 'accounts', 'codex', CODEX_ACCT);
  fs.mkdirSync(codexDir, { recursive: true });
  fs.writeFileSync(path.join(codexDir, 'account.json'), JSON.stringify({ id: CODEX_ACCT, seq: 1 }));
  fs.writeFileSync(path.join(codexDir, 'tokens.json'), JSON.stringify({ access_token: CODEX_B, refresh_token: 'fixture-b', token_type: 'Bearer' }));
  const env = { SKYNET_WORKSPACES: workspace, STARNET_CLAUDE_BIN: makeFakeClaude(fakeRoot), FAKE_CLAUDE_LOG: logFile, FAKE_CLAUDE_AUTHFAIL: failFile,
    SKYNET_CODEX_USAGE_URL: mock.base + '/wham/usage', SKYNET_QUEST_REFRESH: '0', SKYNET_SKILL_REVIEW: '0', SKYNET_SKILL_CURATOR: '0' };
  let { child, port } = await boot(9110 + (process.pid % 30), env, 20);
  const B = () => 'http://' + HOST + ':' + port;
  const calls = () => fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean);
  const ranOn = marker => calls().filter(l => l.endsWith(' run ' + marker)).map(l => l.split(' ')[0]);
  try {
    let token = await bootToken(B(), B());
    const H = () => ({ 'Content-Type': 'application/json', 'X-StarNet-Token': token, Origin: B() });
    const post = async (p, body) => (await fetch(B() + p, { method: 'POST', headers: H(), body: JSON.stringify(body || {}) })).json();
    const get = async (p) => (await fetch(B() + p, { headers: H() })).json();
    const run = async (marker, extra) => {
      const r = await fetch(B() + '/api/run', { method: 'POST', headers: H(),
        body: JSON.stringify(Object.assign({ provider: 'claude-cli', model: 'sonnet', agentId: 'choice-e2e', isTask: false, messages: [{ role: 'user', content: marker }] }, extra || {})) });
      A.eq(r.status, 200, marker + ' streams through the real /api/run route');
      return await r.text();
    };

    A.eq(await get('/api/accounts/choice'), { rule: 'best', rules: ['best', 'order'] }, 'the station rule defaults to BEST');
    const added = await post('/api/auth/claude-cli/add');
    A.eq(added.status, 'connected', 'a second Claude account signs in');
    const extra = added.account;

    // BEST: nothing measured yet -> connection order; the run measures the primary (Max, 96% used = 0.2 headroom)
    await run('CHOICE-E2E-ONE');
    A.eq(ranOn('CHOICE-E2E-ONE'), ['primary'], 'nothing known yet: the run starts on account 1');
    await run('CHOICE-E2E-TWO');
    A.eq(ranOn('CHOICE-E2E-TWO'), [extra], 'BEST: account 2 (never measured counts as unused) beats a Max at 96%');
    await run('CHOICE-E2E-THREE');
    A.eq(ranOn('CHOICE-E2E-THREE'), [extra], 'BEST: Pro at 10% (0.9) still beats Max at 96% (0.2)');
    const list = await get('/api/auth/claude-cli/accounts');
    A.eq(list.rule, 'best', 'the accounts list carries the station rule');
    A.eq(list.accounts.map(a => [a.label, a.plan, a.usedPct, a.next, a.authFailed]),
      [['account 1', 'max', 96, false, false], ['account 2', 'pro', 10, true, false]], 'each account shows its plan, usage and which one runs next');
    A.ok(list.accounts.every(a => a.resetAt > Date.now()), 'with the reset of its fullest window');

    // ORDER: the station rule switches back to connection order
    A.eq(await post('/api/accounts/choice', { rule: 'order' }), { rule: 'order' }, 'the station rule switches to ORDER');
    A.eq((await post('/api/accounts/choice', { rule: 'prefer:claude-cli:primary' })).code, 'bad_rule', 'PREFER is a character rule, not a station rule');
    await run('CHOICE-E2E-FOUR');
    A.eq(ranOn('CHOICE-E2E-FOUR'), ['primary'], 'ORDER: account 1 first again');

    // a character's own rule wins for its runs
    const roster = await (await fetch(B() + '/api/roster', { method: 'POST', headers: H(), body: JSON.stringify({ updatedAt: Date.now(), agents: [
      { agentId: 'choice-e2e', name: 'CHOICE', system: '', provider: 'claude-cli', model: 'sonnet', accountRule: 'prefer:claude-cli:' + extra },
      { agentId: 'choice-plain', name: 'PLAIN', system: '', provider: 'claude-cli', model: 'sonnet', accountRule: 'nonsense' }] }) })).json();
    A.ok(roster && roster.ok !== false, 'the roster accepts a character account rule');
    await run('CHOICE-E2E-FIVE');
    A.eq(ranOn('CHOICE-E2E-FIVE'), [extra], 'PREFER: this character starts on its chosen account despite the station ORDER rule');
    await run('CHOICE-E2E-SIX', { agentId: 'choice-plain' });
    A.eq(ranOn('CHOICE-E2E-SIX'), ['primary'], 'an unknown rule falls back to the station rule');
    const savedRoster = JSON.parse(fs.readFileSync(path.join(workspace, 'agent.roster.json'), 'utf8'));
    A.eq(savedRoster.agents.map(a => [a.agentId, a.accountRule]), [['choice-e2e', 'prefer:claude-cli:' + extra], ['choice-plain', '']], 'the rule is saved with the roster (normalized)');

    // a real sign-in failure: status still says signed in, the turn says authentication_failed
    fs.writeFileSync(failFile, 'primary\n');
    const failed = await run('CHOICE-E2E-SEVEN', { agentId: 'choice-plain' });
    A.eq(ranOn('CHOICE-E2E-SEVEN'), ['primary', extra], 'the failed sign-in fails over to account 2 in the same run');
    A.ok(/"toAccount":"account 2"/.test(failed) && failed.includes('answered by ' + extra), 'the run finished on account 2');
    const afterFail = (await get('/api/auth/claude-cli/accounts')).accounts;
    A.eq([afterFail[0].loggedIn, afterFail[0].authFailed, afterFail[1].next], [true, true, true], 'account 1 shows its failed sign-in; account 2 runs next');
    A.eq((await get('/api/auth/claude-cli/status')).authFailed, true, 'the card status carries it too');
    await run('CHOICE-E2E-EIGHT', { agentId: 'choice-plain' });
    A.eq(ranOn('CHOICE-E2E-EIGHT'), [extra], 'ORDER still skips a failed sign-in until it signs in again');
    const signedIn = await post('/api/auth/claude-cli/start', {});
    A.eq(signedIn.status, 'connected', 'SIGN IN runs claude auth login again');
    A.eq((await get('/api/auth/claude-cli/accounts')).accounts[0].authFailed, false, 'a new sign-in clears the failure');
    await run('CHOICE-E2E-NINE', { agentId: 'choice-plain' });
    A.eq(ranOn('CHOICE-E2E-NINE'), ['primary'], 'and account 1 is back first under ORDER');

    // ChatGPT: plan and usage left come from the account's own usage report; BEST starts on the bigger headroom
    A.eq(await post('/api/accounts/choice', { rule: 'best' }), { rule: 'best' }, 'back to BEST');
    const codexList = await get('/api/auth/codex/accounts');
    A.eq(codexList.accounts.map(a => [a.label, a.plan, a.usedPct, a.next]), [['account 1', 'plus', 20, false], ['account 2', 'pro', 50, true]],
      'ChatGPT accounts show plan and usage from the report; the Pro at 50% (2.5) runs before the Plus at 20% (0.8)');
    A.eq(mock.usageCalls.slice().sort(), ['codex-a', 'codex-b'], 'each account asked about its own usage with its own token');
    A.ok(!JSON.stringify(codexList).includes('fixture.'), 'no token in the accounts payload');
    const cr = await fetch(B() + '/api/run', { method: 'POST', headers: H(),
      body: JSON.stringify({ provider: 'codex', model: 'gpt-5.5', baseUrl: mock.base, agentId: 'choice-codex', isTask: false, messages: [{ role: 'user', content: 'CHOICE-E2E-CODEX' }] }) });
    A.eq(cr.status, 200, 'the ChatGPT run streams');
    A.ok((await cr.text()).includes('answered by codex-b'), 'the ChatGPT run answered from account 2');
    A.eq(mock.calls.filter(c => c.marker === 'CHOICE-E2E-CODEX').map(c => c.who), ['codex-b'], 'BEST started the ChatGPT run on account 2');

    // what was learned and the station rule survive a restart
    A.eq(await post('/api/accounts/choice', { rule: 'order' }), { rule: 'order' }, 'ORDER again before the restart');
    await new Promise(r => setTimeout(r, 2000));   // the usage record is saved on a short debounce
    const saved = JSON.parse(fs.readFileSync(path.join(workspace, 'account.choice.json'), 'utf8'));
    A.eq(saved.rule, 'order', 'the station rule is on disk');
    A.ok(!JSON.stringify(saved).includes('fixture') && !JSON.stringify(saved).includes('@example.test'), 'the saved record holds no token and no email');
    try { child.kill(); } catch (_) {}
    await new Promise(r => setTimeout(r, 300));
    ({ child, port } = await boot(port + 1, env, 20));
    token = await bootToken(B(), B());
    A.eq((await get('/api/accounts/choice')).rule, 'order', 'the station rule survives a restart');
    const reloaded = (await get('/api/auth/claude-cli/accounts')).accounts;
    A.eq(reloaded.map(a => a.usedPct), [96, 10], 'what each account has left survives a restart');

    // removing an account forgets what was known about it
    A.eq((await post('/api/auth/claude-cli/remove', { account: extra })).ok, true, 'account 2 is removed');
    await new Promise(r => setTimeout(r, 2000));
    A.ok(!fs.readFileSync(path.join(workspace, 'account.choice.json'), 'utf8').includes(extra), 'its record is gone from disk');
  } finally {
    try { child.kill(); } catch (_) {}
    try { mock.server.close(); } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 200));
    try { fs.rmSync(workspace, { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(fakeRoot, { recursive: true, force: true }); } catch (_) {}
  }
  A.report('account-choice.e2e.test');
})().catch((error) => {
  console.log('FAIL: account-choice.e2e.test threw - ' + (error && error.stack || error));
  process.exit(1);
});

