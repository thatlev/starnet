#!/usr/bin/env node
// Owner-facing JSON CLI. Tokens are read from a file/environment or the authenticated Mac proxy;
// never accepted in arguments, included in output, or saved with the editable configuration.
import fs from 'node:fs';
const args = process.argv.slice(2);
const action = args.shift() || 'help';
const options = {};
for (let i = 0; i < args.length; i += 2) {
  if (!args[i]?.startsWith('--') || !args[i + 1]) throw new Error('Use --name value options');
  options[args[i].slice(2)] = args[i + 1];
}
if (action === 'help') {
  console.log('station-config.mjs get|preview|apply|history|restore --url http://127.0.0.1:8790 [--file config.json] [--out config.json] [--id backup-id] [--label description] [--token-file private-file]');
  process.exit(0);
}
try {
  if (!['get', 'preview', 'apply', 'history', 'restore'].includes(action)) throw new Error('Unknown action');
  const base = new URL(options.url || 'http://127.0.0.1:8790');
  if (base.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname) || base.username || base.password || base.search || base.hash || base.pathname !== '/') throw new Error('Use the station’s loopback HTTP URL');
  let token = options['token-file'] ? fs.readFileSync(options['token-file'], 'utf8').trim() : (process.env.STARNET_API_TOKEN || '').trim();
  if (!token) {
    const bootstrap = await fetch(new URL('/remote/bootstrap', base), { signal: AbortSignal.timeout(10000), redirect: 'error' });
    if (!bootstrap.ok) throw new Error('Open the connected Mac app, or provide --token-file for a local runtime');
    token = (await bootstrap.json()).token;
  }
  if (typeof token !== 'string' || !token) throw new Error('Station authentication unavailable');
  let body = { action };
  if (['apply', 'preview', 'restore'].includes(action)) {
    if (!options.file) throw new Error('Use --file with a saved get response');
    const doc = JSON.parse(fs.readFileSync(options.file, 'utf8'));
    body = { action, viewerId: doc.viewerId, clientId: doc.clientId, revision: doc.revision,
      config: doc.config, id: options.id, label: options.label };
  }
  const response = await fetch(new URL('/api/station-config/request', base), { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-StarNet-Token': token }, body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000), redirect: 'error' });
  token = '';
  const result = await response.json();
  if (!response.ok || result.ok === false) throw new Error(result.error || 'Configuration request failed');
  const text = JSON.stringify(result, null, 2) + '\n';
  if (options.out) { fs.writeFileSync(options.out, text, { mode: 0o600 }); fs.chmodSync(options.out, 0o600); console.log('Saved configuration response.'); }
  else process.stdout.write(text);
} catch (error) { console.error(error.message || 'Configuration failed'); process.exitCode = 1; }
