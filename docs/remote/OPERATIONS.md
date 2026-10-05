# StarNet Remote operations

## Ownership and persistence

The standard Tauri desktop shell hosts the original local station or an isolated remote WKWebView plus a small Node.js proxy. The local engine starts only when This Computer is selected. The proxy establishes its own SSH connection with strict host-key checking, disabled multiplexing, keepalives and bounded reconnection backoff. It does not control the systemd service. Closing the window or quitting the app terminates only this connection.

The server owns the runtime, tool processes, delegation, routing, scheduled workflows and remote standing goals. The station's pure session commands run without a DOM through the existing Workstreams implementation. Session saves retain revision checks; concurrent or offline edits are preserved as conflicts instead of replacing newer state. User drafts are not replaced during remote refresh.

SSE passes through both proxies without response buffering. Reconnect uses the existing event cursor/replay and snapshot protocol. Transcripts, run journals and station saves supply durable history beyond the bounded event replay buffer. Live round-trip latency is available under Gateway > Connection details; it is a measurement, not an SLA.

Remote API keys, custom base URLs and backup keys persist on the server. Existing browser credentials migrate on the next connected opening; browser copies are removed only after a durable server acknowledgement. Migration cannot overwrite a newer server record or resurrect a removed key. The store uses a private directory (0700) and file (0600), atomic replacement and fsync. It is not an encrypted keychain; protect the server account and private vault. Keys are never returned to the viewer. Desktop keychain and OAuth stores remain separate.

A saved remote station opens even when the provider has exhausted quota, is unavailable, or has no working credential. Settings remain accessible to repair it. Boot and migration do not validate keys against a provider. Saving a newly entered key retains the existing validation flow and preserves the old key if validation fails. Custom model IDs remain selected when an endpoint's model catalog omits them.

The compact Gateway control stays neutral while connected. Reconnection, an expired session or pending decisions adds a visible text label. The panel keeps approval controls stable during polling, disables them while disconnected and distinguishes last-known activity from a live snapshot. Expired sessions require an explicit reload; copy unsent text first. The station’s Gateway control exposes connection status. Station → Connection Setup (Command-K) handles sign-in and SSH settings; see [setup](SETUP.md).

Every remote run and goal command requires a unique request ID, claimed durably before execution. Retrying an accepted ID returns a refusal and never starts another run. Closing a response stream detaches its viewer; explicit cancellation still aborts its server run. Bounded backpressure disconnects a stalled viewer without accumulating unlimited output.

Remote standing goals persist separately from the visual save. The driver uses the existing authenticated run endpoint for both work turns and tool-free judging, retaining the same runtime admission, tools, consent and transcripts. Goals have the upstream 20-turn default and malformed-verdict limits. Pause/clear cancels an active operation. A normal new directive takes over from an active goal in the same session. A crash pauses active goal records at boot, for explicit review and resume. No unfinished operation is automatically replayed.

## Authentication and isolation

GitHub CLI's OAuth app is the sign-in application in this version. The gateway validates the presented credential against GitHub's `/user` endpoint and admits only the configured numeric owner ID. It discards the GitHub credential and issues a random session lasting up to 12 hours. The Mac renews it through `gh`; sessions are held in memory and become invalid on gateway restart. No Control/Files app secret is reused. GitHub sign-in here establishes station ownership; it does not install repository credentials into agent workspaces.

The gateway and runtime bind only to Linux loopback. SSH supplies encryption and host authentication. The local browser proxy validates Host/Origin, and runtime mutation requests still require the per-launch API token from authenticated station HTML. Credentials are not embedded in the app, repository, URL, saved station or logs.

The station page itself is never cached, because it carries that per-launch token. Its scripts and stylesheets are requested by content hash, and the textures, prop art and character sprites by a release token (a fingerprint of the installed release and its files), so the Mac's WebKit cache keeps them until a release changes them and a returning launch loads them without crossing the connection. Scripts, stylesheets and JSON are compressed. Both proxy hops keep only those two static cache policies; every `/api` reply stays `no-store`. A web page the remote station opens (a sign-in, a guide) goes to the Mac's default browser through the window's `starnet-connect://open-external` route, which accepts only http(s) links.

The dedicated Linux account cannot write to application releases, other users' homes or unrelated service directories. Its systemd unit has no capabilities or display/device access, uses private temporary storage and has no swap allowance. Default limits are 1.5 GiB MemoryHigh, 2 GiB MemoryMax, 256 tasks and three concurrent admitted agents. The limits leave room for one Claude Code CLI process (about 220 MB before any work) per concurrently running Claude agent. These are resource limits for this shared server, not a guarantee that every future build fits them. Place projects under the station's private data directory. New workspace grants, tool permissions and model quotas still apply.

Subscription sign-ins persist on the server and are independent of one another, so ChatGPT, Grok, Kimi and Claude Code can all stay connected at once. Each provider can also hold more than one account (Settings → Providers → ＋ ADD ACCOUNT); when the account a run is on reaches its usage limit, the run continues on the next one. Settings → Providers → ACCOUNT CHOICE decides which account a run starts on: **BEST AVAILABLE** (the default) starts on the account with the most usage left, counting a bigger plan for more, and **IN ORDER** starts on the first ready account. A character can override it in its dossier → MODEL → ACCOUNT, including preferring one specific account. Every rule keeps the other accounts as fallbacks; an account resting after its limit or whose sign-in failed goes last. Usage comes from each provider's own report: ChatGPT's usage endpoint, read with that account's token and cached for a minute, and the usage Claude Code reports on each run. Grok and Kimi publish no usage report, so their accounts rank by order and by rests after a limit. The rule and the last known plan and usage per account are kept in `workspaces/account.choice.json` (no token or email). Every sign-in has its own token store and one in-flight refresh at a time, so concurrent runs cannot spend the same rotating refresh token. A sign-in is removed only by DISCONNECT or REMOVE. A device-code sign-in StarNet creates is its own grant; it does not share or consume the tokens of a Codex, Grok or Kimi CLI used elsewhere with the same account.

Claude Code runs through the server's own `claude` CLI (the `claude-code` package, found on the service PATH). Settings → Providers → CLAUDE CODE → SIGN IN starts `claude auth login` as the `starnet` account and opens Claude's sign-in page in the Mac's browser (the server has no browser). Approve there, then paste the code the page shows into the card and press CONNECT. A sign-in whose real turn fails although `claude auth status` still says signed in is shown as SIGN-IN EXPIRED; runs skip it until it signs in again. The CLI keeps that credential in the service account's home, `/srv/private/starnet/.claude/`; StarNet only reads `claude auth status`. Extra Claude accounts keep their own CLI configuration under `workspaces/.secrets/accounts/`. Each turn starts one `claude -p` process with every Claude Code tool, MCP server, setting source and auto-memory disabled, and a child environment stripped of station tokens and held provider keys; StarNet's own tools and consent gates apply. Keep the package current with the server's normal `apt` upgrades.

The LevServer model key allows the gateway's subscription models and preserves a 1% account reserve. The gateway model catalogue is authoritative; no static model list is substituted after a failed lookup. Responses requests preserve `max` and `ultra` reasoning settings.

## Installed paths

| Surface | Location |
| --- | --- |
| Mac app | `/Applications/StarNet.app` |
| Mac nonsecret connection settings | `~/.config/starnet-remote/config.json` |
| Linux immutable releases | `/opt/starnet/releases/<revision>/` |
| Linux active release | `/opt/starnet/current` |
| Runtime data | `/srv/private/starnet/workspaces/` |
| Server-held model key | `/srv/private/starnet/provider.env` (root-only) |
| Remote provider settings | `/srv/private/starnet/workspaces/.secrets/remote-providers.json` (starnet-only) |
| Subscription sign-ins (ChatGPT, Grok, Kimi) and extra accounts | `/srv/private/starnet/workspaces/` (starnet-only) |
| Claude Code sign-in | `/srv/private/starnet/.claude/` (the CLI's own store, starnet-only) |
| Account choice (rule, plan and usage per account) | `/srv/private/starnet/workspaces/account.choice.json` (starnet-only) |
| systemd service | `starnet-remote.service` |
| Linux gateway / runtime | `127.0.0.1:18791` / `127.0.0.1:18792` |
| Mac viewer | Existing connection: `http://127.0.0.1:8790`; new stations use separate saved loopback ports |
| Connection setup | `http://127.0.0.1:18790` |

Use `ssh <your-server> starnet status` for service status (the maintainer's alias is `lev-server-direct`). Use `journalctl -u starnet-remote` on the server for diagnostics. Do not print credential files or `gh auth token` into logs. Model provider changes belong in Settings > Providers. The private model gateway's key lives in Settings > Gateway ([gateway guide](GATEWAY.md)). Which models that key may use is managed on the gateway itself (LevServer Control for the maintainer's server).

## Upgrade and recovery

`remote/deploy-release.sh <ssh-host>` performs steps 2 and 3 from the Mac with the server release packaged in the installed app: it checks the archive against its build record, refuses while the private vault is locked or a run or standing goal is in progress, backs up the station data and service files, runs the installer as a transient systemd unit (so a dropped SSH session cannot leave the station stopped), compares the data with the backup, restores the previous release and data if any step fails, and then removes superseded releases. Exit status 2 means unreachable, 3 vault locked, 4 busy.

1. Review and test a source revision. An archive must include `RELEASE` containing that commit ID. Keep the last installed release.
2. Inspect the authenticated station snapshot and goal status. Stop or wait for work explicitly before a service upgrade; installation refuses to replace an active service.
3. Stop only `starnet-remote.service`, then run the Linux installer with the same owner ID and private data path. It checks runtime readiness and unauthenticated-gateway refusal. Failure stops the new service for inspection.
4. Rebuild the Mac app only when the connection client changes. Back up WebKit data, preferences and connection settings first. The installer quits the app and moves the previous bundle into `work/mac-build/replaced-apps/` before replacement. Existing connection settings are retained. `Contents/Resources/SOURCE_REVISION` identifies the build.
5. Reopen or reload the viewer after a runtime restart to obtain its new per-launch API token. Existing station data remains in the private vault.

The unit requires its data mount and existing data directory; it cannot initialize a replacement station while the private vault is locked. A prior release can be selected deliberately by changing the `current` symlink while the service is stopped. Do not delete workspaces or restore an older save over newer activity as part of a code rollback. Use upstream recovery tools after inspecting the affected state.

## Scope

Crew creation, placement, station editing and character rendering happen on the Mac. Create the permanent crew there before leaving it unattended. Existing crew delegation and temporary server workers continue headlessly. A tool that requests permanent crew creation or interactive UI focus still needs the Mac; it does not fabricate placement or approval when nobody is present.

The minimal Linux install includes AJV and its small dependency tree. It intentionally omits speech/ML runtimes, native PTY support and a browser distribution. Normal shell/file/model tasks do not require these. A future task needing an interactive PTY, browser engine, local voice, platform SDK or additional build tools needs those dependencies installed explicitly. The service itself never renders the station or requires a GPU.

The locally built Mac app is ad-hoc signed and is not notarized. Installed native checks now cover opening the saved remote station, connection setup, switching to the original local runtime and back, draft migration, and complete shutdown. Current candidate evidence is recorded in [PROJECT.md](../../PROJECT.md). Public Developer ID signing/notarization and Lev's acceptance remain separate steps. No production model inference or real task was run during verification.

## Verification

```sh
npm ci --prefix remote --omit=dev --ignore-scripts
node --test test/remote-*.test.js
NODE_PATH="$PWD/remote/node_modules" node scripts/run-test-list.mjs test/remote-regression.list
node test/provider.codex.test.js
node test/provider.registry.test.js
```

Tests use mocked providers and temporary workspaces, on both macOS and Linux. They cover close/reopen continuity, live event replay, durable results, duplicate rejection across restart, explicit cancellation, owner authentication, origin/host refusal, session expiry, low-buffering SSE, real headless session operations, standing-goal continuation without a viewer, goal pause/restart/budgets, provider reasoning and safe cache refresh. Related upstream authentication, consent, delegation, cron, save-conflict and recovery regressions are retained.

For the installed candidate, follow [the acceptance guide](TESTING.md). Current release evidence and broader upstream gate limitations are recorded in [PROJECT.md](../../PROJECT.md).
