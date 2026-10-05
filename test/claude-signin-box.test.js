'use strict';
// node test/claude-signin-box.test.js — the Claude sign-in box (paste the code, CONNECT) stays visible through a
// Settings background repaint. The repaint restores editors the Commander opened; it re-hid this box, which the
// render shows itself, so a remote sign-in left nowhere to paste Claude's code (Lev, 2026-10-05).
const A = require('./_assert.js');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'app', 'stationui.js'), 'utf8');
const box = A.fnBody(source, 'function claudeFlowBoxHtml(flowing, show, dismissable)');
A.ok(box.length > 0 && box.length < 2000, 'claudeFlowBoxHtml is found');
const ctx = { claudeCard: { msg: 'Sign in on the Claude page', url: 'https://claude.com/x' }, esc: s => String(s) };
vm.runInNewContext(box + '\nthis.claudeFlowBoxHtml = claudeFlowBoxHtml;', ctx);
const open = ctx.claudeFlowBoxHtml(true, true, false);
A.ok(/id="prov-claude-inline" data-render-owned>/.test(open), 'a running sign-in draws the box shown and marked render-owned');
A.ok(/id="prov-claude-code"/.test(open) && /id="prov-claude-code-go"/.test(open), 'with the code field and CONNECT');
A.ok(/id="prov-claude-inline" data-render-owned hidden>/.test(ctx.claudeFlowBoxHtml(false, false, false)), 'no sign-in: the box is drawn hidden');
const capture = (source.match(/const disclosures = swap === false \? Array\.from\(body\.querySelectorAll\('([^']+)'\)/) || [])[1];
A.eq(capture, 'details, .key-edit[id]:not([data-render-owned])', 'a background repaint does not restore a render-owned box');
A.report('claude-signin-box');
