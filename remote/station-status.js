'use strict';
// The one place that words the station's connection state in plain language. The Mac connection helper reports it
// (`/remote/client/status`), the native startup page and the station's own status control only show it.
const GRACE_MS = 8000;

function describeStation({ name, paused = false, connected = false, signin = false, downMs = 0 }) {
  if (paused) return { state: 'paused', message: `Disconnected from ${name}` };
  if (connected) return { state: 'connected', message: `Connected to ${name}` };
  if (signin) return { state: 'signin', message: `${name} needs a GitHub sign-in. Open Connection Setup.` };
  // A first attempt, or a quick reconnect, is not yet "offline".
  if (downMs < GRACE_MS) return { state: 'connecting', message: `Connecting to ${name}…` };
  return { state: 'offline', message: `${name} offline — retrying` };
}

// The page a station window shows when it is asked for the station while the connection is down. It looks again every
// few seconds, so the window opens the station by itself the moment the connection is back.
function offlinePage(message) {
  const text = String(message).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta http-equiv="refresh" content="3"><title>StarNet</title>'
    + '<style>html,body{height:100%;margin:0;background:#0d0806;color:#e8c27a;font:20px/1.5 ui-monospace,Menlo,monospace}'
    + 'main{height:100%;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px}'
    + 'p{margin:0;max-width:34em}</style></head><body><main><p role="status">' + text + '</p></main></body></html>';
}

module.exports = { GRACE_MS, describeStation, offlinePage };
