# Agent-editable station configuration

Open **Settings → Configuration** to edit the same JSON that agents use. Changes apply to the
open viewer immediately. The current configuration is read before each edit; an old revision is
refused rather than overwriting changes made since it was read. The floor uses StarNet's existing
Build model and placement rules.

## CLI for external agents

Keep the connected Mac app open. No credential needs to be copied into chat or command arguments:
the CLI obtains the runtime token in memory through the authenticated Mac loopback proxy.
The Mac window may be in the background; unlike hidden browser tabs, it still answers agent reads.

```sh
node scripts/station-config.mjs get --out /tmp/starnet-config.json
# Edit config.settings and/or config.layout in that file; keep its revision and viewer identifiers.
node scripts/station-config.mjs preview --file /tmp/starnet-config.json
node scripts/station-config.mjs apply --file /tmp/starnet-config.json --label "Adjust room lighting"
node scripts/station-config.mjs history
```

The default address is `http://127.0.0.1:8790`. Use `--url` to select a different loopback port.
For a local runtime without the remote proxy, use `--token-file /private/path/to/token` or the
`STARNET_API_TOKEN` environment variable. Tokens are never accepted in command arguments or
included in exported files. Config files are private (0600); they may contain personal room names
or Bay briefs, so do not commit real station exports to a public repository.

An export wraps the editable `config` with its `viewerId`, current `clientId`, and `revision`.
After reopening the viewer, read again to obtain its new client identifier. Its stable viewer
identity and backup history survive restarts. Mac and browser viewers have separate identities.

Settings merge by name. For example, an agent may replace only the `config` value with:

```json
{
  "starnetConfig": 1,
  "settings": { "roomLighting": "medium", "sound": false }
}
```

`layout`, when present, is the **complete** `starnet.station` version 1 document. Edit the existing
rooms, room order, props, belts, edges and metadata from a read instead of inventing a save format.
The layout is bounded to 240 tiles per axis, 128 rooms and 4,096 props. Unknown props, overlapping
placements and invalid mounts are refused by the live catalog/model. Existing crew workstations
and the station identity are preserved. Build mode must be closed before applying.

## In-station agents

The lead agent has `station.config.read` and consent-gated `station.config.apply`. The read returns
the same document as the CLI. The agent passes its viewer ID, client ID and revision when applying
an edit. The tool does not claim success until the page verifies local settings and the durable
layout save. A missing viewer, changed configuration, failed backup or failed read-back returns a
refusal. Work must be idle apart from the agent performing the authorized configuration edit.

Placed equipment grants capabilities. The agent must explain equipment/access changes before
requesting consent. This feature does not change approval rules, execution isolation, credentials
or ownership checks. The owner-facing CLI/API has the same authenticated authority as Settings;
do not give its runtime token to untrusted agents.

## Coverage and extension points

| Area | Supported surface |
| --- | --- |
| Appearance, lighting, text size, CRT, sound, backdrop, session rows, keep-awake, notification preferences | `config.settings`; names and ranges in `frontend/app/stationconfig-core.js` |
| Rooms, floor/wall materials, map geometry, props, Bay assignment/briefs, belts and routing edges | `config.layout`; canonical model in `frontend/app/worldmodel.js`; catalog in `frontend/app/propsprites.js` |
| Spending limits | Existing `GET /api/budget/status`, `POST /api/budget/caps` |
| Backup model order | Existing `GET/POST /api/fallback/chain` |
| Crew metadata, dossier, autonomy, connectors and standing permissions | Existing Settings controls and `POST /api/config/export` / `POST /api/config/import`; see `sidecar/configexport.js` for the section schema |
| Sessions, tasks and routines | Existing `session.*`, `task.*` and `routine.*` agent tools |
| Mac menu-bar icon and lifecycle preferences | **Mac-local** `~/Library/Application Support/ai.skynet.harness/lifecycle.json`; prefer the live Appearance control for immediate application |
| Provider credentials, OAuth and SSH authentication | Existing protected credential/settings flows; never editable through this JSON |
| New renderers, prop art, tool implementations, or new setting types | Source changes, tests and a rebuild; arbitrary code is not loaded from configuration |

This is a broad configuration surface, not a promise that every internal or security-sensitive
field is a hot-reloadable setting. Add new safe settings to the shared validator and their existing
UI application path; do not bypass the validator with arbitrary localStorage or save-file writes.

## Backups and restore

Before application, the runtime fsyncs the previous settings/layout into
`<workspaces>/.station-config/history.json`, in a private directory, with a last-known-good `.bak`.
The history retains the latest 30 completed attempts. It records time, label, changed sections,
viewer and status. `prepared` or `unconfirmed` means application was not confirmed; read current
configuration before retrying. There are no automatic mutation retries.

**Restore before** in Configuration history restores that entry's prior settings and floor, and
backs up what it replaces. It does not rewind conversations, delete crew or remove credentials.
For CLI restoration, first read a fresh configuration export, then:

```sh
node scripts/station-config.mjs restore --file /tmp/starnet-config.json --id BACKUP_ID
```

These snapshots complement, rather than replace, whole-station backups and the installer's Mac
client backups. The existing **App & Backup → Station Backup** covers runtime configuration;
server upgrade backups also retain durable station data and credentials privately.
For the older `/api/config/import` surface, browser-owned autonomy/preferences are returned to the
caller for application by Settings; a raw API request alone does not update an open viewer.

## API

All routes use the normal runtime token, loopback/origin checks and remote GitHub-owner session:

* `POST /api/station-config/request`: `action` is `get`, `preview`, `apply`, `history` or `restore`.
* `apply`/`preview`: `viewerId`, `clientId`, `revision`, `config`, optional `label`.
* `restore`: `viewerId`, `clientId`, `revision`, `id` from history.
* `/claim` and `/ack` are internal viewer delivery endpoints, not agent APIs. A single page claims
  each non-replayed command. The rest of an edit is pinned to that exact page.

Run `node --test test/station-config.test.js` for validation, stale-write, single-claim, backup,
failure, restore and consent tests. No paid model calls are needed.
