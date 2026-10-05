# About this fork

`thatlev/starnet` is an **unofficial fork** of [androoAGI/starnet](https://github.com/androoAGI/starnet), the
local-first pixel-art agent harness by Andrew Sims. It tracks upstream (currently merged through
**v0.12.3**) and adds one major capability: a **remote station**. A Linux server keeps your
agents, keys, files and running work alive around the clock, and the StarNet desktop app on a Mac
becomes a reconnectable window onto it.

This fork is not affiliated with or endorsed by the upstream project. The code is MIT licensed
(see [License and brand](#license-and-brand)); the StarNet name, logo and artwork belong to
Andrew Sims and are **not** covered by that license. Nothing here is an official StarNet release.

Everything upstream does still works. If you never open the connection chooser, this is the normal
StarNet desktop app, and the upstream [README](README.md), [install guide](INSTALL.md) and
[docs](docs/INDEX.md) apply unchanged.

## What the fork adds

| Area | What you get |
| --- | --- |
| **One app, two places** | The standard desktop app asks where the station lives: **This Computer** (the original local runtime, onboarding and keychain) or **Remote Uplink** (another machine). Switch any time with **Station → Connection Setup…** (Command-K); the last choice resumes on launch. |
| **A station that never sleeps** | In remote mode the server owns the runtime, tools, delegation, scheduled workflows and standing goals. Closing the Mac app only closes the window — work keeps running headless under systemd. |
| **Owner-only access** | You sign in with GitHub (through the GitHub CLI). The server admits exactly one configured GitHub account and issues a short-lived session. Its ports bind only to the server's loopback; the Mac reaches them through SSH with strict host-key checking. Nothing is exposed to the internet. |
| **Guided setup** | The connection screen can install a fresh server for you (in Terminal, with visible progress), and **Test & save** checks SSH, ownership, runtime health and the live event stream without running an agent or spending model credits. |
| **Server-held provider settings** | In remote mode, API keys, custom endpoints and backup key pools are stored on the server (private 0700/0600 files, atomic writes) and are never sent back to the viewer. Older browser-held settings migrate once, safely. |
| **Private model gateway** | A **Gateway** provider for your own OpenAI-compatible model gateway, with its own **Settings → Gateway** section, separate from the model providers and their API keys. See [the gateway guide](docs/remote/GATEWAY.md). |
| **Claude Code and stacked sign-ins** | Ported from upstream after v0.12.3: a **CLAUDE CODE** provider runs agents on a Claude subscription through the official Claude Code CLI on the station's machine (StarNet never stores the Claude credential), and ChatGPT, Grok, Kimi and Claude Code can each hold several signed-in accounts, with a run moving to the next account when one hits its usage limit. On a remote station the CLI runs on the server; see [operations](docs/remote/OPERATIONS.md). |
| **Resilience fixes** | Provider streams that never start fail fast; exhausted quota never blocks opening the station; Settings keeps its scroll position, open editors and drafts during background refreshes; drafts and conversations survive reconnects; desktop helpers shut down cleanly on every exit path. |

## How it fits together

```text
 Mac: StarNet.app                          Linux server (systemd: starnet-remote)
 ┌─────────────────────────────┐   SSH    ┌──────────────────────────────────────────┐
 │ station window (WebKit)     │  tunnel  │ gateway   127.0.0.1:18791                │
 │   ⇅                          │ ═══════▶ │   GitHub-owner check, session tokens     │
 │ local proxy 127.0.0.1:8790  │          │   ⇣                                      │
 └─────────────────────────────┘          │ runtime   127.0.0.1:18792                │
                                          │   agents, tools, goals, schedules        │
                                          │   ⇣                                      │
                                          │ model providers / your private gateway   │
                                          └──────────────────────────────────────────┘
```

- The Mac side is the original Tauri app plus a small Node proxy that owns one SSH connection
  and reconnects with bounded backoff. Live updates stream over Server-Sent Events, with replay
  after reconnects.
- The server side is the original StarNet sidecar running headless, wrapped by an authenticating
  gateway. Station data lives in a private data directory. Releases are immutable under
  `/opt/starnet/releases/<revision>`.
- Crew creation, room placement and character rendering still happen in the desktop app. The
  server never needs a display or GPU.

## Getting started

You need a Mac (macOS 13 or newer for remote mode) and, for a remote station, a Linux
x86_64 or arm64 machine with systemd, SSH access and sudo.

1. **Build the desktop app** from a clean, committed checkout on the Mac:

   ```sh
   npm ci
   bash remote/install-mac.sh
   ```

   This needs Node/npm, Rust, the Xcode command-line tools, `tar` and `unzip` on the build
   Mac only. It downloads pinned Node and GitHub CLI binaries, verifies them against their
   official checksums, packages the server archive from Git-tracked sources and installs
   `/Applications/StarNet.app`. Any previous app is moved aside, and connection settings are kept.
2. **Open StarNet** and choose **Remote Uplink** (or **This Computer** for the classic local station).
3. **Sign in with GitHub** using the device code shown, then enter your server's SSH alias or
   `user@host`.
4. For a fresh server, choose **New Server → Open server installer in Terminal**. For an existing
   one, choose **Already Installed**. Then **Test & save** and **Open your station**.
5. Add model access inside the station under **Settings → Providers**, or point it at your own
   gateway under **Settings → Gateway**.

Full details: [connection setup](docs/remote/SETUP.md) · [operations and recovery](docs/remote/OPERATIONS.md) ·
[acceptance checks](docs/remote/TESTING.md) · [private model gateway](docs/remote/GATEWAY.md).

For editable settings, rooms and layouts, use **Settings → Configuration** or the
[agent configuration CLI/API](docs/remote/AGENT-CONFIGURATION.md). Every applied configuration edit
records a private recovery snapshot and visible change history.

## Testing

```sh
npm ci --prefix remote --omit=dev --ignore-scripts
node --test test/remote-*.test.js
NODE_PATH="$PWD/remote/node_modules" node scripts/run-test-list.mjs test/remote-regression.list
node test/provider.registry.test.js
```

The tests use mocked providers and temporary workspaces. They make no paid model calls. The
upstream gates (`npm test`) still run, but some upstream suites have known failures on macOS
that reproduce on an untouched upstream checkout. [PROJECT.md](PROJECT.md) lists them alongside
the verification record for each installed release.

## Status and known limits

- **No published binaries.** `remote/install-mac.sh` produces an ad-hoc signed developer build
  that is not notarized. Use it on your own machines; public distribution would need
  Developer ID signing, notarization and a name and artwork of its own (see below).
- The connection chooser ships on macOS. Other desktop platforms keep upstream's local-only behavior.
- The Linux installer is verified on x86_64. arm64 runtimes are bundled and checksum-verified, but
  arm64 hardware acceptance is still pending.
- The minimal server install omits speech, browser-engine and native PTY dependencies. Normal
  shell, file and model work does not need them.
- Some setup defaults (for example the gateway's default address and the
  `remote/configure-levserver-provider.sh` helper) come from the maintainer's own server. They are
  documented as examples and are easy to change.

## Upstream and contributions

- Upstream releases are merged in deliberately, keeping upstream behavior wherever the remote
  station does not need a change. Each merge and its verification are recorded in
  [PROJECT.md](PROJECT.md).
- A proposal to contribute the remote station upstream is prepared separately in
  [thatlev/starnet-contrib](https://github.com/thatlev/starnet-contrib) (branch
  `codex/remote-uplink-proposal`). It has not been opened as an upstream pull request.
- Issues and pull requests about the remote station belong on this repository. Problems in
  StarNet itself belong upstream.
- Please report security problems privately through this repository's **Security → Report a
  vulnerability** page, not in a public issue. [SECURITY.md](SECURITY.md) covers upstream StarNet.

## License and brand

The code is available under the [MIT License](LICENSE), copyright Andrew Sims. This fork's
changes are offered under the same license. Third-party components keep their own licenses;
see [NOTICE.md](NOTICE.md).

As the upstream [README](README.md#license) explains, the MIT License does not cover the StarNet name,
logo, station artwork or sprites. This repository keeps them only so that it remains a faithful
source fork. Do not ship builds of this fork as "StarNet" or present them as the official project.
A redistributed derivative needs its own name and artwork.
