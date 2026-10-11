/* node test/openai-agent-header.e2e.test.js — boot the ACTUAL sidecar in remote mode and prove the bridge path:
     (a) X-StarNet-Agent runs AS the roster agent: the provider receives that agent's own prompt + caller context
     (b) X-StarNet-Session-Title mirrors the exchange into the agent's titled session in the durable save
         (through the headless station, as on the server with no viewer attached)
     (c) GET /api/autopilot/rails reads runs/<id>/run.json under STARNET_AUTOPILOT_HOME (page token required)
   The upstream LLM is a local mock (no key, no network, no paid call). */
'use strict';
const A = require('./_assert.js');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');
const HOST = '127.0.0.1';
const INDEX = path.resolve(__dirname, '..', 'sidecar', 'index.js');
const KEY = 'e2e-agent-header-key-0123456789';
const PAGE_TOKEN = 'e2e-page-token-' + 'x'.repeat(40);

function startMockProvider(seen) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      if (req.url.indexOf('/models') >= 0) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: [{ id: 'test/model', context_length: 8000, supported_parameters: ['tools'], pricing: { prompt: '0', completion: '0' } }] }));
        return;
      }
      let body = ''; req.on('data', d => { body += d; }); req.on('end', () => {
        seen.push(body);
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
        res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: 'Nothing is in production right now.' } }] }) + '\n\n');
        res.write('data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 9, completion_tokens: 7, total_tokens: 16 } }) + '\n\n');
        res.write('data: [DONE]\n\n'); res.end();
      });
    });
    server.listen(0, HOST, () => resolve({ server, base: 'http://' + HOST + ':' + server.address().port + '/api/v1' }));
  });
}
function boot(port, env, attemptsLeft) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [INDEX], { env: Object.assign({}, process.env, env, { SKYNET_PORT: String(port) }), stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', settled = false;
    const onData = d => {
      out += d.toString();
      if (!settled && out.indexOf('http://' + HOST + ':' + port) >= 0) { settled = true; resolve({ child, port, log: () => out }); }
      else if (!settled && /already in use/i.test(out)) { settled = true; try { child.kill(); } catch (_) {}
        if (attemptsLeft > 0) resolve(boot(port + 1, env, attemptsLeft - 1)); else reject(new Error('no free port')); }
    };
    child.stdout.on('data', onData); child.stderr.on('data', onData);
    child.on('error', e => { if (!settled) { settled = true; reject(e); } });
    setTimeout(() => { if (!settled) { settled = true; try { child.kill(); } catch (_) {} reject(new Error('boot timeout:\n' + out)); } }, 12000);
  });
}
function seedWorkspace(ws) {
  fs.writeFileSync(path.join(ws, 'agent.roster.json'), JSON.stringify({ version: 1, updatedAt: 1, agents: [
    { agentId: 'agent', name: 'CAPTAIN', system: 'You are CAPTAIN-E2E-MARKER, the operator.', model: 'test/model', provider: 'openrouter', role: 'orchestrator', approvalMode: 'full', executionProfile: 'this-computer' },
    { agentId: 'runner', name: 'RUNNER', system: 'You are RUNNER-E2E.', model: 'test/model', provider: 'openrouter', role: 'errands', approvalMode: 'full', executionProfile: 'this-computer' }
  ] }));
  const doc = { schema: 'starnet.save', version: 6, updatedAt: 1, _saveDirty: false, _saveRevision: 1,
    agent: { id: 'agent', name: 'CAPTAIN', role: 'orchestrator', provider: 'openrouter', model: 'test/model', approvalMode: 'full', executionProfile: 'this-computer' },
    agents: [{ id: 'runner', name: 'RUNNER', role: 'specialist' }],
    workstreams: [{ id: 'ws_general', title: null, agentId: 'agent', conversationMode: 'direct', kind: 'chat', lane: 'active', history: [], runIds: [], deliverables: [], cost: { tokens: 0, usd: 0, calls: 0 }, createdAt: 1, lastActiveAt: 1, lastReadAt: 1 }],
    activeId: 'ws_general', generalId: 'ws_general', deletedIds: [] };
  fs.writeFileSync(path.join(ws, 'agent.save.json'), JSON.stringify({ version: 1, agentId: 'agent', updatedAt: 1, savedAt: 1, doc }));
}

(async () => {
  const seen = [];
  const mock = await startMockProvider(seen);
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-v1-agent-'));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-autopilot-'));
  fs.mkdirSync(path.join(home, 'runs', '095-grok'), { recursive: true });
  fs.writeFileSync(path.join(home, 'runs', '095-grok', 'run.json'), JSON.stringify({ id: '095-grok', channel: 'thatlev', title: 'GROK BOT CAN SHOP', steps: [{ name: 'art', status: 'running' }] }));
  seedWorkspace(ws);
  const env = { SKYNET_WORKSPACES: ws, STARNET_WORKSPACES: ws, STARNET_REMOTE: '1', STARNET_API_KEY: KEY, STARNET_API_TOKEN: PAGE_TOKEN,
    STARNET_AUTOPILOT_HOME: home, SKYNET_OPENROUTER_BASE: mock.base, OPENROUTER_KEY: 'sk-or-e2e-fake', STARNET_DESKTOP_SHELL: '0', STARNET_ENV_DISCOVERY: '0', SKYNET_ENV_DISCOVERY: '0' };
  const { child, port, log } = await boot(9010 + (process.pid % 40), env, 20);
  const B = 'http://' + HOST + ':' + port;
  try {
    // (a) run AS the roster agent
    const res = await fetch(B + '/v1/chat/completions', { method: 'POST',
      headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', 'X-StarNet-Agent': 'CAPTAIN', 'X-StarNet-Session-Title': 'Telegram · Videos' },
      body: JSON.stringify({ messages: [{ role: 'system', content: 'TOPIC-E2E: Videos; sender is the owner.' }, { role: 'user', content: 'status' }] }) });
    A.eq(res.status, 200, '(a) the bridged chat completes');
    const body = await res.json();
    A.eq(body.choices[0].message.content, 'Nothing is in production right now.', '(a) the reply is the provider answer');
    A.eq(body.starnet.agent, 'agent', '(a) the response names the roster agent that ran');
    const sent = seen.join('\n');
    A.ok(sent.indexOf('CAPTAIN-E2E-MARKER') >= 0, '(a) the provider received the agent\'s own roster prompt');
    A.ok(sent.indexOf('TOPIC-E2E') >= 0 && sent.indexOf('CALLER CONTEXT') >= 0, '(a) the caller context rides after it');
    A.ok(sent.indexOf('RUNNER-E2E') < 0, '(a) no other agent\'s prompt leaks in');
    A.ok(/"tools"\s*:\s*\[/.test(sent) && /shell/.test(sent), '(a) the crew run is a task: its tools (incl. the shell) reach the provider');

    // (b) mirrored into the durable save through the headless station
    A.eq(body.starnet.session && body.starnet.session.mirrored, true, '(b) the response reports the mirror: ' + JSON.stringify(body.starnet.session));
    const saved = JSON.parse(fs.readFileSync(path.join(ws, 'agent.save.json'), 'utf8')).doc;
    const tg = (saved.workstreams || []).find(w => w.title === 'Telegram · Videos');
    A.ok(!!tg, '(b) the titled session exists in the durable save');
    A.eq(tg && tg.agentId, 'agent', '(b) bound to CAPTAIN');
    A.eq(tg && tg.history.map(m => m.role + ':' + m.content), ['user:status', 'assistant:Nothing is in production right now.'], '(b) the exchange is in the session');
    A.eq(saved.activeId, 'ws_general', '(b) the mirror did not steal focus');

    // a crew member other than the lead mirrors into its own session too (the headless station knows the roster ids)
    const rr = await (await fetch(B + '/v1/chat/completions', { method: 'POST',
      headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', 'X-StarNet-Agent': 'RUNNER', 'X-StarNet-Session-Title': 'Telegram · Movies' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'find a movie' }] }) })).json();
    A.eq(rr.starnet && rr.starnet.agent, 'runner', 'RUNNER ran as itself: ' + JSON.stringify(rr).slice(0, 400));
    A.eq(rr.starnet && rr.starnet.session && rr.starnet.session.mirrored, true, 'RUNNER exchange mirrored: ' + JSON.stringify(rr.starnet && rr.starnet.session));
    const saved2 = JSON.parse(fs.readFileSync(path.join(ws, 'agent.save.json'), 'utf8')).doc;
    const mv = (saved2.workstreams || []).find(w => w.title === 'Telegram · Movies');
    A.eq(mv && mv.agentId, 'runner', 'the Movies session belongs to RUNNER');

    // unknown agent refused before any provider call
    const bad = await fetch(B + '/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', 'X-StarNet-Agent': 'NOBODY' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'UNKNOWN-AGENT-PROBE' }] }) });
    A.eq(bad.status, 404, 'unknown agent → 404');
    await new Promise(r => setTimeout(r, 300));
    A.ok(!seen.some(b => b.indexOf('UNKNOWN-AGENT-PROBE') >= 0), 'no provider call for an unknown agent');

    // (c) rails
    const denied = await fetch(B + '/api/autopilot/rails');
    A.eq(denied.status, 403, '(c) rails need the page token');
    const rails = await (await fetch(B + '/api/autopilot/rails', { headers: { 'x-starnet-token': PAGE_TOKEN } })).json();
    A.eq(rails.ok, true, '(c) rails read ok: ' + JSON.stringify(rails).slice(0, 200));
    A.eq(rails.channels && rails.channels[0] && rails.channels[0].id, 'thatlev', '(c) channel room');
    A.eq(rails.channels[0].runs[0].status, 'running', '(c) rail status from the manifest');
  } catch (e) {
    A.ok(false, 'threw: ' + (e && e.stack) + '\n' + log().slice(-3000));
  } finally { try { child.kill(); } catch (_) {} mock.server.close(); }
  A.report('openai-agent-header.e2e');
})().catch(e => { console.error(e); process.exit(1); });
