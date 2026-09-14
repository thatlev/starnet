'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../remote/startup-observer.js'), 'utf8');
test('native loading reveals a usable layout even when WebKit pauses animation frames', () => {
  const messages = [], listeners = {};
  let active = false, disconnected = false, observe;
  const context = {window:{addEventListener() {}, webkit:{messageHandlers:{stationStartup:{postMessage:m=>messages.push(m)}}}},
    requestAnimationFrame() { throw new Error('An occluded view cannot supply animation frames'); },
    document:{readyState:'loading',querySelector:()=>active ? {getBoundingClientRect:()=>({width:1200})} : null,
      addEventListener:(name,cb)=>listeners[name]=cb},
    MutationObserver:class { constructor(cb){observe=cb;} observe(){} disconnect(){disconnected=true;} }
  };
  vm.runInNewContext(source,context);
  observe(); assert.equal(messages.length,0);
  context.document.readyState='interactive';listeners.DOMContentLoaded();assert.equal(messages.length,0);
  active=true;observe();assert.equal(messages.length,1);assert.equal(messages[0].event,'ready');
  assert(disconnected);observe();assert.equal(messages.length,1,'readiness is emitted once per navigation');
});
