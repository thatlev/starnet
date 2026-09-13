# StarNet Remote operations

## Ownership and persistence

The Mac runs a native WKWebView plus a small Node.js proxy. The proxy establishes its own SSH connection with strict host-key checking, disabled multiplexing, keepalives and bounded reconnection backoff. It does not control the systemd service. Closing the window or quitting the app terminates only this connection.

The server owns the runtime, tool processes, delegation, routing, scheduled workflows and remote standing goals. The station's pure session commands run without a DOM through the existing Workstreams implementation. Session saves retain revision checks; concurrent or offline edits are preserved as conflicts instead of replacing newer state. User drafts are not replaced during remote refresh.

SSE passes through both proxies without response buffering. Reconnect uses the existing event cursor/replay and snapshot protocol. Transcripts, run journals and station saves supply durable history beyond the bounded event replay buffer. Live round-trip latency is shown in the Mac status strip; it is a measurement, not an SLA.

Every remote run and goal command requires a unique request ID, claimed durably before execution. Retrying an accepted ID returns a refusal and never starts another run. Closing a response stream detaches its viewer; explicit cancellation still aborts its server run. Bounded backpressure disconnects a stalled viewer without accumulating unlimited output.

Remote standing goals persist separately from the visual save. The driver uses the existing authenticated run endpoint for both work turns and tool-free judging, retaining the same runtime admission, tools, consent and transcripts. Goals have the upstream 20-turn default and malformed-verdict limits. Pause/clear cancels an active operation. A normal new directive takes over from an active goal in the same session. A crash pauses active goal records at boot, for explicit review and resume. No unfinished operation is automatically replayed.

## Authentication and isolation

GitHub CLI's OAuth app is the sign-in application in this version. The gateway validates the presented credential against GitHub's `/user` endpoint and admits only the configured numeric owner ID. It discards the GitHub credential and issues a random session lasting up to 12 hours. The Mac renews it through `gh`; sessions are held in memory and become invalid on gateway restart. No Control/Files app secret is reused. GitHub sign-in here establishes station ownership; it does not install repository credentials into agent workspaces.

The gateway and runtime bind only to Linux loopback. SSH supplies encryption and host authentication. The local browser proxy validates Host/Origin, and runtime mutation requests still require the per-launch API token from authenticated station HTML. Credentials are not embedded in the app, repository, URL, saved station or logs.

The dedicated Linux account cannot write to application releases, other users' homes or unrelated service directories. Its systemd unit has no capabilities or display/device access, uses private temporary storage and has no swap allowance. Default limits are 768 MiB MemoryHigh, 1 GiB MemoryMax, 256 tasks and three concurrent admitted agents. These are resource limits for this shared server, not a guarantee that every future build fits them. Place projects under the station's private data directory. New workspace grants, tool permissions and model quotas still apply.

The LevServer model key allows the gateway's subscription models and preserves a 1% account reserve. The gateway model catalogue is authoritative; no static model list is substituted after a failed lookup. Responses requests preserve `max` and `ultra` reasoning settings.

## Installed paths

| Surface | Location |
| --- | --- |
| Mac app | `/Applications/StarNet Remote.app` |
| Mac nonsecret connection settings | `~/.config/starnet-remote/config.json` |
| Linux immutable releases | `/opt/starnet/releases/<revision>/` |
| Linux active release | `/opt/starnet/current` |
| Runtime data | `/srv/private/starnet/workspaces/` |
| Server-held model key | `/srv/private/starnet/provider.env` (root-only) |
| systemd service | `starnet-remote.service` |
| Linux gateway / runtime | `127.0.0.1:18791` / `127.0.0.1:18792` |
| Mac viewer | `http://127.0.0.1:8790` |

Use `ssh lev-server-direct starnet status` for service status. Use `journalctl -u starnet-remote` on the server for diagnostics. Do not print provider.env or `gh auth token` into logs. Provider key maintenance belongs to the existing Control admin interface.

## Upgrade and recovery

1. Review and test a source revision. An archive must include `RELEASE` containing that commit ID. Keep the last installed release.
2. Inspect the authenticated station snapshot and goal status. Stop or wait for work explicitly before a service upgrade; installation refuses to replace an active service.
3. Stop only `starnet-remote.service`, then run the Linux installer with the same owner ID and private data path. It checks runtime readiness and unauthenticated-gateway refusal. Failure stops the new service for inspection.
4. Rebuild the Mac app only when the connection client changes. Preserve the previous app before replacing it. The installer refuses an existing app path.
5. Reopen or reload the viewer after a runtime restart to obtain its new per-launch API token. Existing station data remains in the private vault.

The unit requires its data mount and existing data directory; it cannot initialize a replacement station while the private vault is locked. A prior release can be selected deliberately by changing the `current` symlink while the service is stopped. Do not delete workspaces or restore an older save over newer activity as part of a code rollback. Use upstream recovery tools after inspecting the affected state.

## Scope

Crew creation, placement, station editing and character rendering happen on the Mac. Create the permanent crew there before leaving it unattended. Existing crew delegation and temporary server workers continue headlessly. A tool that requests permanent crew creation or interactive UI focus still needs the Mac; it does not fabricate placement or approval when nobody is present.

The minimal Linux install includes AJV and its small dependency tree. It intentionally omits speech/ML runtimes, native PTY support and a browser distribution. Normal shell/file/model tasks do not require these. A future task needing an interactive PTY, browser engine, local voice, platform SDK or additional build tools needs those dependencies installed explicitly. The service itself never renders the station or requires a GPU.

The locally built Mac app is not notarized. Native visual acceptance remained pending at setup because the Mac was locked. Authenticated proxy access, server state, model catalogue and source-level frontend behavior were verified; no production model inference or real task was run during setup.

## Verification

```sh
npm ci --prefix remote --omit=dev --ignore-scripts
node --test test/remote-*.test.js
NODE_PATH="$PWD/remote/node_modules" node scripts/run-test-list.mjs test/remote-regression.list
node test/provider.codex.test.js
node test/provider.registry.test.js
```

Tests use mocked providers and temporary workspaces, on both macOS and Linux. They cover close/reopen continuity, live event replay, durable results, duplicate rejection across restart, explicit cancellation, owner authentication, origin/host refusal, session expiry, low-buffering SSE, real headless session operations, standing-goal continuation without a viewer, goal pause/restart/budgets, provider reasoning and safe cache refresh. Related upstream authentication, consent, delegation, cron, save-conflict and recovery regressions are retained.
