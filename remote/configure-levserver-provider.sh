#!/bin/bash
set -euo pipefail
umask 077
[[ $(id -u) == 0 ]] || { echo 'Run with sudo on LevServer' >&2; exit 1; }
mountpoint -q /srv/private || { echo 'Unlock the private vault first' >&2; exit 1; }
id starnet >/dev/null 2>&1 || useradd --system --home-dir /srv/private/starnet --shell /usr/sbin/nologin starnet
install -d -m 0700 -o starnet -g starnet /srv/private/starnet
node --input-type=module - <<'JS'
import fs from 'node:fs';
const file='/srv/private/starnet/provider.env';
if(fs.existsSync(file)){console.log('Existing StarNet provider configuration preserved');process.exit(0);}
const adminFile='/srv/private/admin/luna-admin-token';
const fd=fs.openSync(adminFile,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
const st=fs.fstatSync(fd);
if(st.uid!==0 || (st.mode&0o777)!==0o640 || !st.isFile())throw Error('Unsafe admin credential metadata');
const admin=fs.readFileSync(fd,'utf8').trim();fs.closeSync(fd);
const headers={authorization:'Bearer '+admin,'content-type':'application/json'};
const get=async route=>{const r=await fetch('http://127.0.0.1:8782/admin/v1/'+route,{headers,signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Gateway metadata unavailable');return r.json();};
const existing=await get('keys');
if(existing.data.some(k=>k.name==='StarNet Remote'&&k.enabled))throw Error('A StarNet key already exists without its configuration. Reconcile it in Control; refusing a duplicate.');
const policy=await get('models');
const models=policy.model_policies.filter(m=>m.provider==='codex').map(m=>m.id);
if(!models.length)throw Error('No subscription models available');
// The name check fences a retry following an uncertain accepted create. The key
// goes directly into the encrypted vault, never stdout, argv, the Mac or Git.
const response=await fetch('http://127.0.0.1:8782/admin/v1/keys',{method:'POST',headers,
body:JSON.stringify({name:'StarNet Remote',allowed_models:models,weekly_quota_percent:null,minimum_account_remaining_percent:1}),signal:AbortSignal.timeout(10000)});
if(response.status!==201)throw Error('Key creation was not confirmed; reconcile in Control before retrying');
const value=await response.json();
if(!/^(?:sk-lev-codex-[A-Za-z0-9_-]{12}-[A-Za-z0-9_-]{43}|(?:luna_live|lev_codex_live)_[A-Za-z0-9_-]{12}_[A-Za-z0-9_-]{43})$/.test(value.key))throw Error('Unexpected key response; reconcile in Control');
const temporary=file+'.new';
const out=fs.openSync(temporary,'wx',0o600);
try {fs.writeFileSync(out,'STARNET_LEVSERVER_KEY='+value.key+'\nSTARNET_LEVSERVER_BASE_URL=http://127.0.0.1:8781/v1\n');fs.fsyncSync(out);}finally{fs.closeSync(out);}
fs.renameSync(temporary,file);
fs.writeFileSync('/srv/private/starnet/provider-key-id',value.id+'\n',{mode:0o600,flag:'wx'});
console.log('Dedicated StarNet key configured for '+models.length+' subscription models. No inference requested.');
JS
