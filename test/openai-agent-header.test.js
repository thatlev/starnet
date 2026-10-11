'use strict';
// X-StarNet-Agent / X-StarNet-Session-Title: an authenticated bridge (Telegram) runs a message AS a named roster
// agent with that agent's own prompt, and the exchange is mirrored into the agent's titled app session.
// Production HTTP adapter with a fake runOnce and a fake mirror; no provider, no credentials, no model calls.
const assert = require('node:assert/strict');
const http = require('node:http');
const { makeOpenAiCompat } = require('../sidecar/openai-compat');
(async () => {
  let serial = 0;
  const seen = [];
  const mirrors = [];
  let mirrorMode = 'ok';
  const roster = [
    { agentId: 'agent', name: 'CAPTAIN', model: 'claude-opus-5-5', provider: 'claude-cli' },
    { agentId: 'runner', name: 'RUNNER', model: 'claude-opus-5-5', provider: 'claude-cli' }
  ];
  const systems = { agent: 'You are CAPTAIN. Read real state.', runner: 'You are RUNNER.' };
  const api = makeOpenAiCompat({
    now: () => 5000, newId: () => String(++serial),
    apiKey: () => 'agent-header-test-key-123456',
    readBody: async req => { let s = ''; for await (const c of req) s += c; return s; },
    roster: () => roster,
    agentSystem: id => systems[id] || '',
    mirrorTurn: async o => {
      mirrors.push(o);
      if (mirrorMode === 'refuse') return { ok: false, error: 'sessions are not ready yet' };
      if (mirrorMode === 'hang') return new Promise(() => {});
      return { ok: true, result: { mirrored: true } };
    },
    runOnce: o => {
      seen.push(o);
      o.emit('agent.run.start', { runId: 'run-' + serial });
      if (o.messages.at(-1).content === 'fail') { o.emit('agent.run.error', { message: 'provider down' }); o.emit('agent.run.end', { reason: 'error' }); return; }
      o.emit('agent.token', { delta: 'status: 0 runs in flight' });
      o.emit('agent.cost', { tokensIn: 4, tokensOut: 6 });
      o.emit('agent.run.end', { reason: 'done' });
    }
  });
  const server = http.createServer((req, res) => api.handle(req, res));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const auth = { Authorization: 'Bearer agent-header-test-key-123456', 'Content-Type': 'application/json' };
  const post = (headers, body) => fetch(base + '/v1/chat/completions', { method: 'POST', headers: Object.assign({}, auth, headers), body: JSON.stringify(body) });
  let n = 0;
  try {
    // 1. pinned by display name: runs as the roster id with the agent's own prompt + caller context after it
    let res = await post({ 'X-StarNet-Agent': 'captain', 'X-StarNet-Session-Title': 'Telegram · Videos' },
      { messages: [{ role: 'system', content: 'Topic: Videos. Sender: Lev (owner).' }, { role: 'user', content: 'status' }] });
    assert.equal(res.status, 200); n++;
    let body = await res.json();
    let run = seen.at(-1);
    assert.equal(run.agentId, 'agent', 'runs as the roster agent id, not an api-* session agent'); n++;
    assert.equal(run.provider, 'claude-cli'); n++;
    assert.equal(run.model, 'claude-opus-5-5'); n++;
    assert.ok(run.system.startsWith('You are CAPTAIN. Read real state.'), 'own prompt leads'); n++;
    assert.ok(run.system.includes('CALLER CONTEXT') && run.system.includes('Topic: Videos.'), 'caller system rides after it'); n++;
    assert.equal(run.surface, 'autonomous'); n++;
    assert.equal(run.isTask, true, 'a pinned crew run is a task: its tools are advertised'); n++;
    assert.equal(body.choices[0].message.content, 'status: 0 runs in flight'); n++;
    assert.equal(body.starnet.agent, 'agent'); n++;
    assert.deepEqual(body.starnet.session, { title: 'Telegram · Videos', mirrored: true }); n++;
    assert.equal(mirrors.length, 1); n++;
    assert.equal(mirrors[0].agentId, 'agent'); n++;
    assert.equal(mirrors[0].sessionTitle, 'Telegram · Videos'); n++;
    assert.equal(mirrors[0].userText, 'status'); n++;
    assert.equal(mirrors[0].replyText, 'status: 0 runs in flight'); n++;

    // 2. pinned by id, no title: no mirror; the model field is ignored in favour of the header
    res = await post({ 'X-StarNet-Agent': 'runner' }, { model: 'CAPTAIN', messages: [{ role: 'user', content: 'download x' }] });
    body = await res.json();
    assert.equal(seen.at(-1).agentId, 'runner'); n++;
    assert.equal(seen.at(-1).system, 'You are RUNNER.', 'no caller system => own prompt only'); n++;
    assert.equal(body.starnet.session, undefined); n++;
    assert.equal(mirrors.length, 1); n++;

    // 3. unknown agent: refused before any run
    const before = seen.length;
    res = await post({ 'X-StarNet-Agent': 'nobody' }, { messages: [{ role: 'user', content: 'hi' }] });
    assert.equal(res.status, 404); n++;
    assert.equal((await res.json()).error.code, 'unknown_agent'); n++;
    assert.equal(seen.length, before, 'no run started for an unknown agent'); n++;

    // 4. failed run: an honest note is mirrored, status says failed
    res = await post({ 'X-StarNet-Agent': 'CAPTAIN', 'X-StarNet-Session-Title': 'Telegram · Videos' }, { messages: [{ role: 'user', content: 'fail' }] });
    assert.equal(res.status, 502); n++;
    assert.match(mirrors.at(-1).replyText, /^\[no reply: failed - provider down\]$/); n++;

    // 5. a refused mirror is reported, not hidden
    mirrorMode = 'refuse';
    res = await post({ 'X-StarNet-Agent': 'CAPTAIN', 'X-StarNet-Session-Title': 'Telegram · Dev' }, { messages: [{ role: 'user', content: 'status' }] });
    body = await res.json();
    assert.deepEqual(body.starnet.session, { title: 'Telegram · Dev', mirrored: false, error: 'sessions are not ready yet' }); n++;

    // 6. streaming carries the same agent + session truth on the finish chunk
    mirrorMode = 'ok';
    res = await post({ 'X-StarNet-Agent': 'CAPTAIN', 'X-StarNet-Session-Title': 'Telegram · Videos' }, { stream: true, messages: [{ role: 'user', content: 'status' }] });
    const raw = await res.text();
    const fin = raw.split('\n').filter(l => l.startsWith('data: {')).map(l => JSON.parse(l.slice(6))).at(-1);
    assert.equal(fin.starnet.agent, 'agent'); n++;
    assert.equal(fin.starnet.session.mirrored, true); n++;
    assert.ok(raw.endsWith('data: [DONE]\n\n')); n++;

    // 7. without the header, the documented behaviour is unchanged (session agent, caller system only)
    res = await post({}, { model: 'CAPTAIN', messages: [{ role: 'system', content: 'S' }, { role: 'user', content: 'plain' }] });
    assert.equal(res.status, 200); n++;
    assert.match(seen.at(-1).agentId, /^api-/); n++;
    assert.equal(seen.at(-1).isTask, undefined, 'plain /v1 keeps the chat default'); n++;
    assert.equal(seen.at(-1).system, 'S'); n++;

    // 8. the header needs auth like everything else
    res = await fetch(base + '/v1/chat/completions', { method: 'POST', headers: { 'X-StarNet-Agent': 'CAPTAIN', 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'x' }] }) });
    assert.equal(res.status, 401); n++;

    // 9. capabilities advertise the headers
    const caps = await (await fetch(base + '/v1/capabilities', { headers: auth })).json();
    assert.equal(caps.agent_header, 'X-StarNet-Agent'); n++;
    assert.equal(caps.session_title_header, 'X-StarNet-Session-Title'); n++;
    console.log('openai-agent-header: OK (' + n + ' assertions)');
  } finally { server.closeAllConnections(); await new Promise(r => server.close(r)); }
})().catch(e => { console.error(e); process.exitCode = 1; });
