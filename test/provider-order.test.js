'use strict';
// node test/provider-order.test.js — CLAUDE CODE is the second provider card whether or not STARNET MANAGED is shown.
const A = require('./_assert.js');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'app', 'stationui.js'), 'utf8');
const body = A.fnBody(source, 'function claudeSecond(list)');
A.ok(body.length > 0 && body.length < 600, 'claudeSecond is found');
const ctx = {};
vm.runInNewContext(body + '\nthis.claudeSecond = claudeSecond;', ctx);
const ids = list => ctx.claudeSecond(list.map(id => ({ id }))).map(p => p.id);
const order = ['starnet', 'claude-cli', 'openrouter', 'codex', 'grok', 'kimi', 'openai'];
A.eq(ids(order), order, 'with STARNET MANAGED shown: STARNET, then CLAUDE CODE');
A.eq(ids(order.filter(id => id !== 'starnet')), ['openrouter', 'claude-cli', 'codex', 'grok', 'kimi', 'openai'], 'without it: OPENROUTER, then CLAUDE CODE');
A.eq(ids(['levserver']), ['levserver'], 'the GATEWAY section is untouched');
A.eq(ids(['claude-cli']), ['claude-cli'], 'a single card stays');
A.ok(/return claudeSecond\(visibleProviders\(\)\.filter\(p => providerInScope\(p\.id, scope\)\)\)\.map\(/.test(source), 'the PROVIDERS cards are drawn in that order');
A.report('provider-order');
