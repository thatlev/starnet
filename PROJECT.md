# StarNet Remote

Public, unofficial fork of androoAGI/starnet, updated through v0.12.3 (`3ba5b84922f3b62caa4e159999ef3acc82af2a3e`) on its default `feat/harness-backend` branch.
Upstream history, MIT license and notices are retained. The public overview is [FORK.md](FORK.md); this file is the release log.

## Active release: Claude sign-in like the others, and account choice

Lev reported "couldn't check Claude Code" on 2026-10-05 and asked for Claude to sign in the same way as the other providers, sit second in Providers with its icon, and for every multi-account provider to fall back across accounts, use the best one (the biggest plan with the most usage left) and allow a custom rule per character.

- [x] CLAUDE CODE is the second card in Settings → Providers, with the Claude mark. A status the station could not answer retries every 8 seconds instead of sticking, and SIGN IN is offered whenever Claude is not usable: signed out, an unanswered check, or a sign-in whose real turn failed.
- [x] Remote sign-in works end to end. The server's Claude Code cannot open a browser, so the card opens Claude's sign-in page in the Mac browser and takes the code it shows (✓ CONNECT). The native remote window now hands new-window web links to the Mac browser: WebKit dropped them before, so OPEN SIGN-IN PAGE and every other such link did nothing in remote mode. Only http(s) links are passed.
- [x] Account choice (`sidecar/account-choice.js`). Station rule in Settings → Providers → ACCOUNT CHOICE: BEST AVAILABLE (default; plan size × share of the cap unused, an account never measured counts as unused) or IN ORDER. Each character can choose its own rule in its dossier → MODEL → ACCOUNT, including preferring one specific account. Every rule keeps the other accounts as fallbacks; an account resting after a limit or whose sign-in failed goes last. Usage comes from each provider's own report: ChatGPT's usage endpoint (checked live: plan_type and used_percent per window) and the rate_limit_event Claude Code writes on each run. Grok and Kimi report no usage, so they rank by order and rests. A spent weekly limit now rests the account until its stated reset instead of credPool's one-hour ceiling. The rule and what is known per account persist in `workspaces/account.choice.json` (no token or email).
- [x] A real Claude sign-in failure (`authentication_failed` while `claude auth status` still says signed in) is shown as SIGN-IN EXPIRED, demoted, and cleared by the next sign-in. This Mac's own Claude Code sign-in is in exactly that state: its status says signed in, but a real call returns "OAuth session expired and could not be refreshed".
- [x] Each account row shows its plan, a usage bar with the reset time, READY / RESTING / SIGN-IN EXPIRED, and which account RUNS NEXT. The rows are a flat divided list inside the card (no nested boxes); the sign-in and key editors inside a card use the concentric radius (card radius − padding − border, floored at 0).
- [x] `remote/deploy-release.sh` installs the server release packaged in the Mac app with backup, an idle check, transient-unit execution and automatic rollback.
- [ ] Install on LevServer once it is back online and unlocked (an hourly check runs `remote/deploy-release.sh lev-server-direct`).
- [ ] Lev signs in to Claude on the station.

Verification: 46 account-choice assertions (rules, ranking, parsing of both providers' real shapes, rests, failed sign-ins, persistence) and 46 end-to-end assertions against the real sidecar (fake Claude Code with two identities reporting usage; a fake ChatGPT usage report; BEST, ORDER, a character's PREFER, an unknown rule falling back, a real sign-in failure failing over in the same run and clearing on SIGN IN, restart persistence, removal). The existing stacking tests (20 Claude, 23 ChatGPT/Grok/Kimi), Claude provider/login/sign-in tests, credpool, roster and run tests, all 37 remote tests, the 21-step remote regression list and 56 native tests pass. The 830-step fast list shows only the 19 failures that already fail on `2b52ea560`. A seeded browser station showed the cards, rows, rule switch and the dossier ACCOUNT picker at desktop and 420px widths.

## Active release: Claude Code connection and stacked sign-ins

Lev asked on 2026-10-05 for a Claude connection with the correct icon, working end to end, and for every connection to support more than one provider without being signed out.

- [x] Port upstream's Claude Code provider (`claude-cli`) and SIGN IN WITH CLAUDE: 22 feature commits cherry-picked from `androoAGI/starnet` (`3d032f64a` through `ac98203c2`), plus the cut-off tool-call refusal they rely on (`3d757a919`). Conflicts only touched this fork's Gateway entries, the aligned narrow provider layout and test lists; both sides were kept. The ported provider, sign-in, account and sign-in-engine files are byte-identical to upstream.
- [x] Port subscription stacking: ChatGPT, Grok, Kimi and Claude Code can each hold several accounts (＋ ADD ACCOUNT, per-account SIGN IN/REMOVE); a run that hits one account's usage limit continues on the next.
- [x] Use the official Claude mark (lobe-icons 1.95.0, MIT, recorded in `sources.json`) instead of upstream's generic terminal glyph, and list CLAUDE CODE with the other subscription sign-ins.
- [x] Give the Claude Code CLI a station-secret-free environment: upstream's `child-env.js`, wired to this fork's held credentials (runtime keys and pools, channel tokens, ChatGPT/Grok/Kimi and extra-account tokens, service keys, registry key variables).
- [x] Audit sign-out risks. Each sign-in has its own store, every refresh path is single-flight (two runs cannot spend one rotating refresh token), StarNet never imports another client's tokens, and only DISCONNECT/REMOVE log out. Fixed the API KEYS hint that assumed ChatGPT was the only sign-in.
- [x] LevServer: upgraded `claude-code` 2.1.223 → 2.1.285 (upstream's sign-in flow was proven on 2.1.284); confirmed every CLI flag the provider uses, and that the `starnet` account keeps its own Claude login in `/srv/private/starnet/.claude/`. Raised the unit to 1.5 GiB MemoryHigh / 2 GiB MemoryMax because one Claude Code process uses about 220 MB before any work.
- [x] Rebuild and install the Mac app and server release; remove superseded builds.
- [ ] Lev signs in to Claude on the station (Settings → Providers → CLAUDE CODE → SIGN IN, then paste the code the page shows).

Verification: 73 Claude provider, 22 login, 11 sign-in engine and 17 text-protocol assertions; 16 account-store, 20 Claude stacking and 23 ChatGPT/Grok/Kimi stacking assertions; 27 cut-off-call and 42 sanitizer assertions; 66 ChatGPT, 148 registry and 29 credential-rotation assertions; all 37 remote tests and the 21-step remote regression list; 55 native tests. All 829 fast-list tests ran individually: 19 fail identically on the untouched base `2b52ea560` (including the existing missing `test/native-startup.test.js` list entry, `settings-save-failure` and the claims ledger), and the determinism lint keeps its 4 existing problems. A seeded local station showed the CLAUDE CODE card after Kimi with the Claude mark, the Mac's real `claude auth status` (SIGNED IN · MAX) and ＋ ADD ACCOUNT at desktop and 420px widths.

Installed: Mac and server source `07110f71ed10d9d81f80af851f0e131923b5877a`. The Mac app passed deep/strict signature verification, and its source stamp and packaged server checksum match. The idle server was stopped, its data, unit and CLI wrapper backed up to `/srv/private/starnet-upgrade-backups/07110f71ed10d9d81f80af851f0e131923b5877a/`, and the installer passed package checksums, runtime health and unauthenticated-gateway refusal. All 64 backed-up data files match byte for byte; the only addition is the regenerated workspace-owner claim. The unit now reports MemoryHigh 1.5 GiB and MemoryMax 2 GiB, the served Claude icon matches the source, and `claude auth status` run under the unit's own sandbox settings reports its configuration directory as `/srv/private/starnet/.claude`. In the installed app, the remote Settings → Providers kept ChatGPT SIGNED IN · VERIFIED through the upgrade and showed CLAUDE CODE after Kimi with SIGN IN WITH CLAUDE and ＋ ADD ACCOUNT. The first launch hit the existing LINK DOWN / FEED: RECONNECTING follow-up while the server's event stream answered 200 with its ready frame; a normal quit and reopen reached FEED: LIVE. The agent's saved model is empty ("follows station default") in both the backup and live data, so the picker's "no model selected" predates this release.

Old builds removed at Lev's request: every superseded server release (`7cb93968f`, `89939e82c`, `d4290bce6`, `ff581a297`; the root disk was at 95%, now 90%) and the upload/extraction files; on the Mac the replaced app and build output went to the Trash. Data backups, Mac client backup `work/mac-build/client-backup-20261005-*` and Git history remain for recovery.

Incident: LevServer reset uncleanly at about 07:05 during this work (journal ends without a shutdown; no panic, OOM or service fault logged; SSH from the Mac also reported the network unreachable). It booted with the private vault locked, as designed; the vault was unlocked and the station returned before installation.

## Active release: aligned provider actions

- [x] Give LINK STATION, ADD KEY and SIGN IN a shared action width and consistent edges at wide and narrow pane sizes, without changing their behavior.
- [x] Verify enlarged text, focus clearance, status alignment and the inline key editor.
- [x] Publish the CSS-only runtime update and retain rollback/data backups.

The old narrow layout indented most actions by 42px to clear a provider logo, but made an exception for STARNET MANAGED. Actions now fill a shared 190px column in wide cards and the card's inner width in narrow cards; narrow status labels share their left edge. The existing labels, button padding, focus outlines and card shapes remain intact, with no additional wrappers or controls. A disposable Chromium regression reproduced the old misalignment and now passes at six pane widths (279–640px, including both sides of the 480px breakpoint) and 100%, 150% and 200% interface zoom. Keyboard focus and the inline key editor's open/close actions pass. The related provider/OAuth guards (136 assertions) and three delayed-settings-refresh tests also pass. The website mirror is synchronized.

Installed runtime: `89939e82ce6e6a4405276eb7a9acf044be2ebf17`. The station was idle before installation; package checksums, runtime health and unauthenticated gateway refusal pass. All 62 durable files match the pre-upgrade backup, excluding only the regenerated workspace-owner claim. The previous immutable release and private backup at `/srv/private/starnet-upgrade-backups/89939e82ce6e6a4405276eb7a9acf044be2ebf17/` remain available. The served stylesheet matches the reviewed source, and the temporary extraction directory was removed. StarNet was quit normally and reopened; its native shell stays at `7cb93968f` because no client code changed. Providers loaded in the native accessibility tree, but macOS returned a stale screenshot and then `noWindowsAvailable`, so a fresh native visual check is not claimed. The existing intermittent FEED: RECONNECTING follow-up remains separate from this CSS-only release; no credentials, provider selection or model work were changed.

## Active release: one window for remote launches

- [x] Open a saved remote station in a single window. Previously the app showed the bundled "OPENING YOUR STATION" page in the privileged `main` window, then created a separate `station-remote-<port>` window and destroyed the first, so two windows appeared in turn. Now the remote window is created at launch on the bundled page and navigates itself to the station when the helper is ready. Loading the station inside `main` was rejected because its initialization script carries the local runtime token.
- [x] Keep the boundaries: the remote label never passes the native-command gate (bundled page included; the page has no scripts); the bundled page is allowed only until the window first opens its station; the legacy viewer-storage import runs only on the station origin, so it cannot write into the local station's storage; dock, tray and second-launch reveal resolve the window by its label from launch; Connection Setup retires a window still on the startup page, as it retired the old placeholder.
- [x] Verify the installed build with a read-only CoreGraphics window sampler (200 ms): normal launches show one window id from first paint to the live station (window at ≈3 s); with the helper deliberately blocked, the same window shows the startup page and the existing connection alert; Connection Setup then retires it cleanly and Return to station opens the live station; re-opening the running app keeps one process and one window; Command-Q leaves no app, helper or SSH process and frees both loopback ports. 55 native tests pass, including startup-port parsing and startup-page/command-gate checks.

Build note: Xcode 27's `strip` (installed 2026-10-02) rewrites the metadata of stripped proc-macro dylibs, so a cold release build failed with "can't find crate" (rustc: "Rejecting via crate name"). `[profile.release.build-override] strip = false` leaves build-time code unstripped; the shipped binary is still stripped. Incident: at 17:20–17:21 on 2026-10-03 `node_modules` was removed from nearly every project under `~/Documents/VibeCoding` (not by this release's cleanup, which only removed named app bundles and build folders). StarNet's dependencies were restored with `npm ci` (root and `remote`); the staged runtime dependencies are byte-identical to the previous installed build. npm 11 skipped four install scripts; node-pty and onnxruntime binaries match the previous build.

In this release's five native launches the station reached FEED: LIVE each time; the open LINK DOWN bug below stays open until it is understood.

## Active release: menu bar icon and setup panel colour

- [x] Add Settings → Appearance → MENU BAR ICON (Monochrome default, Color), saved natively on the Mac with the lifecycle preferences and applied to the menu bar icon immediately. Pages reach it only through `starnet-connect://menu-bar-icon/monochrome|color`, handled by both the local and remote station windows; no other native authority is exposed.
- [x] Make the setup ("GET ACQUAINTED") panel use the theme's opaque panel colour instead of a fixed teal-black `#080b0b`, so it matches the COMMS panel it covers. The rule was identical to upstream; the station had been parked at a pending setup question, so the overlay was permanently visible.
- [x] Fix LINK STATION padding in narrow Settings panes: the STARNET card's narrow-width rule zeroed the button's own left padding along with its indent. Verified 12px/12px button padding, aligned with the card content, at 417px and 279px list widths.
- [x] Rebuild and install the Mac app and server release; verify the icon, the setting and the panel colour.

Verified in the installed app: Appearance shows MENU BAR ICON with Monochrome selected by default; choosing Color and then Monochrome wrote `menuBarIconMonochrome` false/true to `~/Library/Application Support/ai.skynet.harness/lifecycle.json`, and the chips followed the state the native app reported back. The setup panel now samples warm (≈ rgb 13,8,6) instead of neutral blue-black. The menu bar icon itself was not visually captured (screen capture here excludes other apps' menu bar extras); 53 native tests cover the whitelist, icon decoding and preference defaults.

## Recovery follow-up: native remote window can stay on FEED: RECONNECTING

The installed Mac app's remote window sometimes stays on LINK DOWN / FEED: RECONNECTING for minutes, including in front and after relaunches; another launch may go live within seconds. On the same proxy and server, Safari and Chromium go live immediately, and Chromium also stays live with the native init flags (`__STARNET_NATIVE__`, `__STARNET_CONNECTION_SETUP__`, `__STARNET_MENU_BAR__`) injected. The event stream returns 200 with a ready frame, the snapshot returns 200, the helper reports connected, and the server has no SSE client limit. Remaining suspects are state specific to the app's own WebKit store (`~/Library/WebKit/ai.skynet.harness`) or WKWebView behaviour in the Tauri window. Next step: a diagnostic build with an inspectable web view to read the bridge state directly. It predates this release (seen on `90af4a36d`). An earlier note here attributing it to background-window throttling was wrong and is withdrawn.

The configuration release fixes a demonstrated recovery gap: the HUD detected a silent/half-open stream after 40 seconds but only reopened it if EventSource emitted an error. A 5-second watchdog now replaces a stream with no activity for over 40 seconds, preserving the replay cursor and single-stream guards. Snapshot reads time out after 10 seconds. Injected CONNECTING/OPEN stalls, healthy streams, stale callbacks and deliberate pause are covered by the 84 SSE assertions. This prevents the demonstrated indefinite-wait path; the original intermittent native failure's underlying WebKit cause is not claimed proven.

## Active release: agent-editable station configuration

Lev asked to finish the queued configuration work on 2026-10-03. Correction: upstream's `station.layout` is explicitly read-only, not a floor editor. Pulling in 867 unrelated commits is unnecessary for this feature; reuse this fork's existing `WorldModel.replaceLayout` validation and history.

- [x] Add a versioned configuration surface for viewer settings and complete station layouts, usable by agents and from Settings.
- [x] Reject stale/invalid edits, target one viewer, preserve capability consent, and durably snapshot each change with visible history and restore.
- [x] Document the CLI/API and existing configuration surfaces for runtime settings, crew, providers and native Mac preferences.
- [x] Verify failure/recovery and responsive UI, rebuild/install, retain data backups and remove superseded app builds.
- [x] Prepare the reviewed public-fork release and its verification record for publication.

Pre-install checks: all 37 remote tests, the 21-entry remote regression list, 55 native tests and 84 SSE assertions pass. The dedicated configuration tests cover backup failures, stale edits, restoration, consent and single-viewer claims. A disposable browser station verifies API and Settings Apply/Restore, save/reload persistence, CLI export permissions, and usable layouts at 1360, 720 and 390px. Narrow Settings navigation now stays in one horizontally scrollable row instead of wrapping over the content. No real model calls or production configuration edits were used for these checks.

Installed checks caught a discovery edge case: Settings could read its explicitly targeted configuration, but an untargeted CLI read skipped the native page while macOS marked its window hidden. Native viewers now answer background reads as well; the browser regression runs the real CLI with the native flag and hidden document to guard this case. Hidden browser tabs still defer to a visible viewer.

Installed Mac and server source: `7cb93968f087b591addfee4dbdccb0fbb10832a0`. Deep/strict Mac signature verification and matching source stamps pass. A cold launch retained one named StarNet window (`6252`) from the startup page to the station; the final native observation showed `FEED: LIVE`. The installed CLI read and no-change preview succeeded (15 settings, one existing room, four props; private 0600 export; no configuration mutation). Settings → Configuration also loaded in the installed candidate. The monochrome preference remains true in the Mac-local lifecycle file.

Both server upgrades passed package checksums, runtime health and unauthenticated gateway refusal. Each private backup comparison retained all 62 durable files byte-for-byte, excluding only the regenerated workspace-owner claim. Final server backup: `/srv/private/starnet-upgrade-backups/7cb93968f087b591addfee4dbdccb0fbb10832a0/`. Mac client state, WebKit data and lifecycle preferences are retained in `work/mac-build/client-backup-20261003-215205/` (and earlier backups). The superseded `5512ab761` and intermediate `d4290bce6` app bundles were moved to the Mac Trash, where they remain recoverable; their source also remains in Git for rebuilding. Temporary server extraction directories were removed. No real inference or agent work was started, and no provider credentials or live station configuration were edited.

Scope audit: Gateway separation/spacing, LINK STATION padding, the setup/chat panel colour, Mac-local monochrome control, public-fork documentation, single-window startup, configurable settings/layouts with restoration, rebuild/reopen and old-bundle cleanup are implemented. The intermittent native reconnecting indicator's deeper cause remains the separately tracked recovery follow-up above; this release proves bounded silent-stream recovery, not the cause of every native pause. Public signing/notarization and an official upstream PR remain outside this fork release.

## Active release: Gateway settings section and public fork

- [x] Move the private model gateway out of Providers / API Keys into its own Settings → Gateway section, keeping its select, add-key, update, backups and remove controls.
- [x] Route the "no key" banner to Gateway when the gateway is the missing provider.
- [x] Fix Gateway spacing from Lev's installed-app review: add a gateway icon instead of an empty logo slot, separate the saved key into a GATEWAY KEY group, space the explanation from the card, and lay key actions out in a row that wraps below the credential when narrow.
- [x] Document the fork (FORK.md, docs/remote/GATEWAY.md, README notice, setup/operations/testing updates).
- [x] Rebuild and reinstall the Mac app and the server release; remove old builds.
- [x] Make the fork repository public after the history scan.

Installed: Mac and server source `2ed7b955e3389258a615ac509a96af7df8ab4373`. The Mac app passed deep/strict signature verification and its source stamp matches. The server passed the installer's runtime-health and unauthenticated-refusal gates; station data matched the pre-upgrade backup except the regenerated owner claim, and the served station UI contains the new section. The installed app showed Settings → Gateway with the verified key and Providers/API Keys without the gateway. Data backups: `/srv/private/starnet-upgrade-backups/90af4a36d1cce85fd53776b20dd9cab026140bea/` and `…/2ed7b955e3389258a615ac509a96af7df8ab4373/`; Mac client backups remain under `work/mac-build/client-backup-*`.

Old builds removed at Lev's request: all superseded server releases under `/opt/starnet/releases` (only `2ed7b955e` remains; any revision can be rebuilt from Git), and on the Mac the replaced app bundles, retired StarNet Remote bundles, temporary build folders and the debug bundle were moved to the Trash. Data backups were kept.

Observed: the native remote window can show LINK DOWN after launch; see the open bug above.

The gateway section reuses the existing card and key-row markup and handlers; key rows keep their indexes in the full credential list, so actions resolve the same stored entry from either section. A local fixture with a dummy gateway key confirmed the section order, its absence from Providers/API Keys, Update and Backups editors, the two-step Remove, and selection, with the section remaining selected after each repaint.

Pre-publication scan: gitleaks found no secrets in the 32 fork commits on `main` or the 8 on `codex/remote-uplink-proposal`. A review for hostnames, addresses, emails and account IDs found only the existing commit author email and documented SSH aliases. Upstream is public under MIT; Actions stay disabled on the fork.

Known pre-existing gate issues, unchanged by this release: `settings-save-failure.test.js` fails in its own harness setup (`window is not defined`) on the previous `main` as well, and the product-claims ledger's README byte lock has not matched since the fork first added its remote-station README section. The ledger is upstream's reviewed claims authority and was not re-blessed.

## Active follow-up: retire the startup window

- [x] Diagnose the duplicate loading-window entry and retire only the temporary startup shell.
- [x] Preserve local/remote switching, close/quit and single-instance reveal behavior.
- [x] Run native regressions, rebuild/install and verify the window lifecycle; prepare the private-fork fix.

The running app has one native process and one connection helper; the extra black switcher entry is the retained `main` startup placeholder. Remote handoff previously called `hide()`, keeping that native window alive. Successful remote/setup handoff now destroys only `station-host.html`, without invoking the close handler. The original local window builder and lifecycle handler are reused through a factory so choosing This Computer can create the privileged local shell on demand. Closing a remote-only app without `main` still goes through the bounded remote flush and normal helper shutdown. An existing local station window retains its original background-work lifecycle.

This is a Mac shell change. No server runtime change or restart is needed.

Installed Mac source: `8bab88a7955a6280b187008e54b4f0558afb0609`. All 50 native tests and deep/strict signature verification passed. Native destruction events confirmed the startup window was removed after successive remote launches. A remote-only window close exited the native process and helpers; an additional launch while running returned to the single existing process. This Computer created the original local shell on demand, Connection Setup returned to the saved remote station with a live feed, and Command-Q exited the app, local runtime and connection helpers. The final launch resumes remote mode. Client backup: `work/mac-build/client-backup-20260919-205454/`; prior app bundles remain retained. No provider settings were changed and no model request or agent task was started. The official upstream PR continues to wait for Lev's acceptance.


## Active follow-up: compact settings and Gateway controls

- [x] Reproduce and fix the remaining delayed settings movement and overlapping provider text at narrow widths.
- [x] Match Test & Save and Cancel sizes; open the station automatically after first successful setup.
- [x] Reuse StarNet components for Gateway details and safe connection controls, including setup access without a keyboard shortcut.
- [x] Center the desktop startup placeholder; verify layouts, reconnect behavior and persistence, then rebuild the candidate.
- [x] Prepare the reviewed follow-up for private-fork publication after installed native verification.

- [x] Follow current upstream for the right conversation panel, superseding the earlier request for its historical numbered-choice presentation.

### Compact settings and Gateway verification

Latest upstream remains `3ba5b84922f3b62caa4e159999ef3acc82af2a3e`. Its current conversation renderer, including the dark background and text-first answer field, is now used for remote stations too. Browser comparison against that exact commit found identical panel markup, every computed CSS property and element bounds. Only draft preservation hooks remain on top of the renderer. This supersedes the older historical-renderer receipts below.

| Before | After | Why |
| --- | --- | --- |
| Removing a delayed account paragraph lost its collapsed 16px bottom margin outside the height reservation. | A flow-root includes that margin in the reserved account surface. | Reproduced a 15.65 CSS pixel scroll shift; both delayed completions and a rebuild then retained scrollTop 3536.52 with a stable 3793px scroll height. |
| Long endpoints crossed saved-key action buttons in narrow Settings panes. | Endpoints wrap; actions occupy a separate grid row below the provider details. | A 341px card with a long synthetic z.ai URL had separated text and action bounds. |
| Gateway used separate styling and offered no viewer controls. | Shared term/sn-menu/bb components show server, GitHub account, connection setup, disconnect and reconnect. | 17 browser approval/recovery/focus checks passed; explicit disconnect/reconnect retained the page and recovered identity. No server execution request was sent. |
| First-time setup needed an additional Open Station click, and busy actions differed in size. | First successful setup opens once automatically; Cancel and Test & Save share bounds. | Browser dimensions were 220x54 at desktop and 156x80 at 390px; VM checks cover stale polls, cancellation and existing connections. |
| The startup placeholder occupied the top-left corner. | Existing wordmark, heading and hint are centered as a group. | Measured centers at 1280x633 and 390x844 matched the viewport center with no horizontal overflow. |

The Gateway dialog inherits the station's text color explicitly because native HTML dialogs otherwise use a user-agent color. At 390px it measures 366px wide with 12px insets, readable shared typography and no internal horizontal overflow. Disconnect affects this viewer session only and keeps saved configuration and GitHub CLI sign-in. Controls require a same-origin custom header, serialize mutations, cancel stale login/poll results, and never replay runs.

### Installed compact-settings candidate, 2026-09-19

Mac and server source: `01572276cd3de085a45486bf0d7d9c30f7f3ac08`. The standard `/Applications/StarNet.app` was rebuilt and installed; deep/strict signature verification, packaged source stamps and remote helper source comparisons passed. Client state and the prior app remain backed up under `work/mac-build/client-backup-20260919-175951/` and `work/mac-build/replaced-apps/`.

All 37 focused remote tests (also under the installed Node 22.23.2 runtime), 50 native Rust tests and eight upstream dialogue/onboarding/settings test entries passed. The website mirror matches 14,534 frontend files. Package checksums passed on Mac and server. The matching server release passed runtime health and unauthenticated gateway refusal; durable data stayed byte-identical at revision 145, with zero runs, prompts, summons, queues and goals. Backup: `/srv/private/starnet-upgrade-backups/01572276cd3de085a45486bf0d7d9c30f7f3ac08/`. Previous release `ed53742c39ede6b7485fc922bea1056bf52ad710` is retained. No real model inference or agent tasks were started.

Installed native verification confirmed saved remote startup, current upstream conversation UI, the shared Gateway dialog, server/account identity, viewer-only disconnect, explicit reconnect and recovery of the same account. Connection Settings opens from Gateway without a keyboard shortcut, retains the saved host and GitHub identity, and shows equally sized Cancel/Test & Save buttons during checks. Test & Save passed SSH, ownership, runtime and SSE validation; Open Station returned to the same saved station with a live feed. The app remains open for Lev to test. Lev's acceptance steps are in `docs/remote/TESTING.md`. Public signing/notarization, Linux arm64 hardware acceptance, the broader upstream gate issues documented below and the official upstream PR remain separate; the PR still waits for Lev's testing.

## Active follow-up: one desktop app

- [x] Merge connection selection into the standard StarNet desktop shell, retaining its actual local runtime, keychain and lifecycle behavior.
- [x] Offer this computer and remote uplink in one app; default fresh remote setup to a new server, while preserving existing saved connections.
- [x] Replace the SSH diagram, em dashes, separate-app link and technical validation footer with concise privacy and security copy.
- [x] Verify local/remote isolation, switching and state preservation; rebuild the unified Mac candidate and publish reviewed source only to the private fork.

The unified candidate uses the original Tauri app, identifier and local engine; the separate Swift viewer and duplicate loading UI are retired. Native commands accept only the bundled local window. Remote/setup windows use isolated loopback origins without local keychain authority. The helper is supervised without reloading the station, and its lifetime pipe/child IPC prevent orphan connections. Remote saves get a bounded flush before setup and exit. Legacy viewer drafts/preferences import once, by matching origin and without replacing existing keys. Fresh setup defaults to New Server and needs no GitHub account for local use. macOS 13+ is required by the bundled runtime. Official upstream PR still waits for Lev's acceptance.

### Unified installed candidate, 2026-09-19

Mac and server runtime source: `ed53742c39ede6b7485fc922bea1056bf52ad710`. The single installed app is `/Applications/StarNet.app`, version 0.12.3, using the original `ai.skynet.harness` identifier. Deep/strict signature verification passed. Its source stamp and packaged server build receipt match this revision. The latest client backup is `work/mac-build/client-backup-20260919-172023/`; previous bundles and WebKit data remain retained. There is no separate Remote app in Applications.

The loading veil now reuses the existing `.logo-img` component and original `frontend/assets/brand/starnet-wordmark.svg`, exactly as the station header does. Browser rendering was inspected, and the installed server's loading markup, stylesheet and wordmark matched the reviewed source. The earlier plain-text diamond/title is removed. The intermediate setup alert came from mismatched launcher/helper lifetime expectations; stdin lifetime handling is now explicitly enabled only by the native launcher that owns the pipe.

Native verification covered saved remote startup, Command-K setup, successful SSH/ownership/snapshot/SSE checks, switching to original local onboarding and back, and remote quit/reopen without re-entering credentials. The old viewer's unsent draft migrated byte-for-byte with a private export and insert-only import. A corrected native build also passed the complete remote/local/remote/quit sequence: the app, helper and local runtime all exited. The final installed bundle's last visual reopening is pending because the Mac was locked; these prior native checks and the final signature/source checks do not claim that final reopening happened.

All 50 native tests and 33 remote tests passed; the 10 setup/migration/lifetime cases also passed under bundled Node 22.23.2. Fresh setup was checked at 390px and 900px widths, with New Server selected, no personal hostname, local use available without GitHub sign-in, concise privacy copy and no horizontal overflow. Existing delayed-scroll and original-panel comparisons remain recorded below.

A final installation check exposed restrictive code-directory permissions inherited from the Mac builder's private umask. The installer now makes immutable release code readable/traversable by its service account without changing private data permissions. A fresh Linux x86_64 systemd container, with no Node/npm and no network, passed installation using 0700 package directories and umask 077. Runtime readiness, unauthenticated 401, execution as the service account, 0700 data permissions and refusal to overwrite a running station all passed. The temporary container and staging directories were removed.

The server is installed at `/opt/starnet/releases/ed53742c39ede6b7485fc922bea1056bf52ad710`. Installation passed runtime health and authentication refusal; durable data was byte-identical at save revision 138, with zero runs, prompts, summons, queues and goals. The backup is `/srv/private/starnet-upgrade-backups/ed53742c39ede6b7485fc922bea1056bf52ad710/`, and previous working release `612bc7a696adfc1ff84bf4ac1805c4860c4980cc` remains available. The failed permissions candidate was rolled back before the corrected install; no station data was restored over newer data. No model inference or production agent tasks were started.

The requested provider persistence, refresh stability, original conversation UI, official loading wordmark and unified desktop onboarding are implemented. Private-fork publication is authorized. Lev's installed acceptance, public signing/notarization, Linux arm64 hardware acceptance and the broader upstream gate issues below remain before official upstream publication; no official PR has been opened.

## Active release: remote display and connection setup

- [x] Reproduce delayed scroll movement and distinguish data refresh from decorative screen flicker.
- [x] Preserve provider geometry and editors during asynchronous updates; restore the original StarNet conversation renderer and styles without reverting upstream interview logic.
- [x] Verify delayed updates in the browser; the 15-second reply retains the exact scroll position.
- [x] Package, install and prepare the reviewed display/connection candidate for the private fork.

| Before | After | Evidence |
| --- | --- | --- |
| A 243px account result became a 24px loading placeholder during rebuild, clamping the scroll position before the delayed result returned. | Reserve the account surface's current height until Settings closes. | Browser reproduced a 221px shift; the fixed 18-second test with a 15-second response had zero scroll movement. |
| Rebuilt provider cards replayed their entrance animation; upstream also dimmed the entire game every seven seconds. | Background renders suppress card entrance motion. Remote viewers adopt a one-time calm default while retaining the explicit Screen Flicker toggle. | Browser reported no card or full-screen flicker animations after the refresh. |
| Upstream's new conversation layout put a large answer box above expandable suggestions; our first repair added a duplicate renderer and incorrect remote CSS. | Reuse StarNet's original numbered-choice renderer and unchanged shared styles; remove the duplicate renderer and remote.css entirely. | Compared against pre-update commit `2f2985718`: identical panel DOM, all computed CSS properties and element bounds for the original question/options. BOSS is 22px and the question is aligned at the top left. New interview suggestions still open the user's own answer editor. |

## Remote connection onboarding in this candidate

- [x] Research official Hermes first-launch, existing-server and new-server paths.
- [x] Add an accessible connection/setup flow with durable settings, clear failure recovery and explicit execution location.
- [x] Provide a reproducible server installation and desktop packaging path suitable for upstream review, without depending on Lev's host/account.
- [x] Verify setup, cancellation, authentication and reconnect behavior; rebuild and provide acceptance steps. Official upstream PR still waits for acceptance.

The setup screen uses StarNet’s actual shared stylesheets, components, local VT323 font and ASCII wordmark, with layout-only setup CSS. The earlier independent setup styling was superseded by Lev’s request to reuse the actual UI.

The setup helper is isolated from remote station HTML by a separate loopback origin and CSRF token. Connection checks authenticate ownership and exercise the runtime/SSE without inference; failures and cancellation preserve the prior configuration. Distinct server/account connections keep separate browser origins. The Mac package includes verified Node/GitHub CLI binaries and a reviewed Linux installer payload; no personal host or account is seeded. See [setup and distribution](docs/remote/SETUP.md).

| Before | After | Why |
| --- | --- | --- |
| A fresh viewer needed external tools and a manually written connection file. | Native first-launch setup, bundled helpers, GitHub sign-in and a tested SSH form. | Makes installation usable on a clean Mac. |
| One local origin was reused for every host. | Stable origins per server/account, retaining the existing origin during migration. | Keeps drafts and cached station settings separate. |
| A missing remote runtime had no desktop setup path. | An explicit new-server installer with visible scope and progress in Terminal. | Installs the reviewed server without replacing an active station. |

### Installed display/setup candidate — 2026-09-19

Mac 0.2.0 (build 5) and server runtime source: `612bc7a696adfc1ff84bf4ac1805c4860c4980cc`. The installed Mac signature passed deep/strict verification, and all eight bundled shared UI assets matched the original frontend sources byte-for-byte. Native inspection confirmed the restored original BOSS heading, top-left question and numbered choices. The setup screen uses the same actual StarNet font, wordmark and components. Native Command-K opened setup, detected the existing GitHub account, and Test & Save passed SSH, ownership, snapshot and event-stream checks against the installed server while retaining local origin 8790.

All 31 focused remote/native tests passed on Mac and Linux. Dialogue (35 assertions), onboarding (70), onboarding legibility (57), refresh and journal checks passed after the final restoration; the website mirror matched. The earlier candidate also passed 20 selected upstream regression suites on both systems. Browser checks covered the 15-second provider reply with zero scroll movement, cancelled/failed setup preserving the prior connection, and setup at desktop, compact and phone widths. The historical dialogue comparison used commit `2f2985718`: identical markup, all computed CSS properties and element bounds for the question and choices. Keyboard selection opens an empty editor and submits the exact entered words.

The packaged Linux installer was exercised in an isolated x86_64 systemd container without Node/npm preinstalled: initial install and readiness succeeded, unauthenticated gateway access was refused, and a second install refused to replace an active station. Both Linux runtime binaries have official checksum verification; arm64 still needs hardware acceptance. A fresh Mac fixture without helper tools on PATH reached first-launch setup using the bundled helpers. Public Developer ID signing/notarization and release publishing remain maintainer steps.

The final server installer passed health and authentication checks. Durable data was byte-identical across installation at save revision 108, with no runs, prompts, summons, queues or goals. Only the ephemeral workspace process-owner claim is excluded from this comparison, following upstream's recovery definition. The first verification attempt conservatively rolled back when that regenerated claim was counted; no persistent data was lost. A transient viewer save conflict after the interrupted upgrade contained only run/rating synchronization timestamps; the original and conflict copy remain preserved, and the built-in reload recovered the current station.

Recovery retains prior runtime `9fda61ae75d0aaebb9cd9a1c2221d9c3eb699b60`, earlier releases, private data/unit backup `/srv/private/starnet-upgrade-backups/612bc7a696adfc1ff84bf4ac1805c4860c4980cc/`, previous Mac bundles and the client backup under `work/mac-build/`. No production inference or agent tasks were created. Lev's visual/functional acceptance and the separately documented broader upstream gate work remain before an official PR.

## Release: durable providers and stable remote settings

- [x] Compare with the current upstream default branch and merge its updates.
- [x] Persist remote provider credentials and custom endpoints on the server; resume saved stations without an inference or balance gate.
- [x] Keep provider settings scroll, focus and edits stable during delayed background loads.
- [x] Review and simplify the remote additions, including gateway connection reuse and recovery.
- [x] Run focused regressions, attempt upstream fast/HTTP gates and build the native candidate.
- [x] Install the reviewed server and Mac test candidate, retaining the old release and client state.
- [x] Prepare the reviewed release for the private fork with Lev's acceptance steps. Upstream PR waits for Lev's testing.

Installation receipt (2026-09-19): runtime and Mac source `ed483d6f43278def01555001d9bcc7784ad488d8`; Mac 0.1.3 (build 4), compiled and signature-verified in `/Applications/StarNet Remote.app`. All 16,092 staged runtime/test source files matched the reviewed checkout by SHA-256. Linux passed 22 remote tests and all 20 selected upstream regression suites; Mac passed 28 focused remote/native/onboarding tests and the same 20 regression suites. The installer passed runtime readiness and unauthenticated-gateway refusal. The station save remained byte-for-byte identical, at revision 87; runs, prompts, summons, queues and goals were all zero before and after installation. No production inference was used.

Recovery: the previous server release remains `/opt/starnet/releases/24643b70f`. A private pre-upgrade data/unit backup is under `/srv/private/starnet-upgrade-backups/ed483d6f43278def01555001d9bcc7784ad488d8/`. The previous Mac bundle and client data are retained under `work/mac-build/replaced-apps/` and `work/mac-build/client-backup-*/`. Installed Mac interaction and Lev's acceptance remain pending; no upstream PR has been opened.

Implementation: remote API keys, custom endpoints and backup keys now use the server's protected `.secrets/remote-providers.json` store. Writes are atomic, fsynced and confirmed before the viewer deletes its legacy copies. Migration is insert-only so an older viewer cannot undo a replacement or removal. The desktop keychain and privileged IPC gate remain unchanged. Saved remote stations open independently of provider availability or quota. Custom model IDs survive catalogs that omit them.

Settings health results update existing card labels instead of rebuilding the form. Necessary background rebuilds preserve the current scroll, open editors, draft values and focus synchronously; deferred scroll restoration timers are removed. Both proxy hops reuse bounded HTTP connections, without adding retries or buffering SSE. The Mac installer preserves connection settings and retains the previous app. Upstream's README and workflows are restored; Actions remain disabled on the private fork.

Validation: isolated remote persistence/restart/authentication/quota tests; all remote behavior tests; 20 selected upstream lifecycle, consent, save and recovery suites; provider registry, compatible-provider, timeout, model reconciliation, pricing, connector and onboarding checks; website mirror validation; native Swift compilation and signing. An actual browser with a provider delayed 15 seconds and returning 429 stayed in the station for 32 seconds, retained the custom model, and kept every sampled scroll position and unsaved editor value through background updates. Tests use synthetic credentials and do not run production inference. See [acceptance steps](docs/remote/TESTING.md).

Broader gate limitations, queued separately before an upstream PR: the full fast gate stops at `ledger-reconcile.test.js` because the fork's larger QA report is truncated by the CLI's immediate `process.exit(0)` while stdout is piped. The untouched upstream checkout passes this case. The HTTP gate also exposes macOS `/var` versus `/private/var` expectations in `e2e.pathtrust.test.js` and a script-only job creation expectation in `cron.api.test.js`; both failures reproduce on the untouched v0.12.3 checkout. A remaining-fast run was stopped in the long-running product-claims audit. The complete upstream gates are therefore not green. The unrelated QA/path/cron work is not claimed fixed by this remote release.


## Release: responsive Mac viewer and resumable setup

- [x] Diagnose the white gap, native canvas upload stalls, interview replay and lost save acknowledgments.
- [x] Add native StarNet loading, direct Retina 2D rendering without the costly decorative barrel-warp copy, and audio-clock scheduling.
- [x] Save answered interview questions and completed model replies; resume the pending question and local text draft.
- [x] Preserve real concurrent-save protection while reconciling an already delivered save after a lost ACK.
- [x] Match Gateway to StarNet's VT323/phosphor design and recover transport and runtime credentials automatically.
- [x] Complete regression, native interaction, loading, draft recovery and reconnect checks.
- [x] Deploy the reviewed server release, rebuild/install the Mac viewer, preserve the user's station, and push main.

The earlier speculative asset/protocol optimization was discarded when cancelled. The subsequent responsiveness, audio, setup persistence, Gateway styling and reconnect requests are included here. No production tasks are created by verification. The user has now created a station and answered onboarding questions; preserve that state instead of expecting an empty setup.

Release receipt: server source `eb369d7bfde015d04a2d9ae83bdfbd0b35a6fdda`; Mac 0.1.2 (build 3), including the native loading observer from `d48645556`. The installed app signature and bundled source identity passed. Linux passed the installer health gate and unauthenticated gateway refusal; served rendering, onboarding and Gateway sources matched the reviewed checkout. The previous server releases, previous Mac app and station save/conflict copies are preserved.

Native acceptance: inspected the StarNet loading artwork and its transition into the actual upright BOSS/Pikachu station; Gateway uses the house font/theme at the bottom right. Typed into the installed app, closed/reopened an unsent setup draft, verified its exact recovery, then cleared the test text without submitting it. The previous personal dossier matched its pre-upgrade backup. The save-conflict banner is gone. An intentional interruption of only the Mac SSH child recovered automatically in 4.87 seconds, with no retry click. The final station showed LIVE, and the server had zero runs, pending approvals and goals.

Validation: remote lifecycle/authentication/SSE/replay tests, save concurrency/unload/refusal/unknown-state tests, interview resume/migration/late-reply cancellation tests, audio-clock scheduling, native startup without animation frames, native hit coordinates and world lifecycle tests passed. The isolated Gateway fixture passed 17 interaction assertions plus desktop/390px layout checks; browser CRT context-loss recovery passed nine checks. Isolated fixtures were stopped after verification.

Performance scope: the native viewer retains Retina resolution, characters and lighting while bypassing the synchronous canvas-to-WebGL barrel-warp/sharpen copy identified in the original profile. The native loading overlay no longer waits for animation frames from an occluded WebKit view. Audio voices use look-ahead scheduling and clean up completed nodes; interrupted audio can resume on the next gesture. Display-paced 120 FPS and audible glitch-free music remain unverified: background native fixtures did not deliver usable frame-pacing samples, and CPU submission measurements are not an FPS measurement. These are acceptance limits, not station tasks or scheduled follow-ups.

## Previous release: persistent LevServer station

- [x] Inspect upstream lifecycle, persistence, authentication and existing server access.
- [x] Create the independent private thatlev/starnet repository.
- [x] Add a small Linux CLI, isolated service and GitHub-authenticated gateway over pinned SSH.
- [x] Keep runs, delegation and station sessions working without the Mac renderer; reconcile live events and durable state on reconnect.
- [x] Build and install the Mac remote station client; leave production empty, with no agent tasks or schedules.
- [x] Verify authentication refusals, disconnect/reconnect, explicit cancellation, replay, persistence and Linux resource use with isolated fixtures.
- [x] Review source and install the release through its health gate.

## Previous follow-up: quiet gateway interface

- [x] Replace the floating connection banner with a compact Gateway control and optional details.
- [x] Retain visible reconnect/decision states and the existing approval and live-state behavior.
- [x] Rebuild and install the Mac app and verify the scoped change. Push the reviewed source with this receipt.

Gateway interface follow-up: source `897d1e70a35afecae33d97618f5af70ca71e7569`, Mac version 0.1.1 (build 2). The installed app signature and connection-source identity passed. The matching Linux release passed the installer readiness gate and unauthenticated-access refusal; the old release and Mac app are preserved.

Verification: all 15 remote behavior tests and 105 provider registry assertions passed. An isolated browser fixture passed 17 gateway interaction assertions plus keyboard disclosure/Escape checks. Desktop, 390px width and 200% text at the minimum Mac window size were checked; the zoom check caught and fixed viewport clipping. Tests included pending approvals, disconnected/expired sessions, rejected consent responses, text-only argument rendering and focus retention. The actual installed frontend loaded through the rebuilt app's authenticated proxy, showed the new Gateway panel and provider label, and had no floating banner. The station remained empty after installation. Native menu/window inspection is still pending because the Mac is locked; the browser checks do not claim native acceptance.

The server owns execution and durable station state. The Mac owns rendering and user input.
Never automatically replay an interrupted tool or model run after a server crash.
Recovery must use the existing explicit continuation/review flow. Closing the Mac app is not a server crash.
Do not seed or run agent tasks on the installed station during setup.

Standing goals were included in the active release after inspection found their upstream continuation loop depended on the Mac. The remote driver reuses the bounded state machine and existing authenticated run path. No production goals are created.

Native visual acceptance was pending during the initial locked-Mac setup; the responsiveness release receipt above records the subsequent native checks.

## Verified setup receipt — 2026-09-13

Runtime source revision: `39495066c6ccfb5b399e43f0167e7419186d5512`. The subsequent setup-record commit changes documentation only.

- Linux: installed at `/opt/starnet/releases/39495066c6cc`; `starnet-remote.service` is enabled and active. Health gate passed, unauthenticated gateway returned 401, private-vault mount conditions passed.
- Mac: `/Applications/StarNet Remote.app` rebuilt for macOS 13+, signature checked, installed client sources match the reviewed revision, authenticated to the numeric `thatlev` owner.
- Tests: all 15 remote tests passed on Mac and Linux. All 20 selected upstream regression tests passed on both hosts; provider Codex/registry and world lifecycle checks passed on Mac. Minimal dependency audit found no vulnerabilities.
- Actual authenticated Mac-to-server snapshot round trips: 37, 40, 38, 38 and 39 ms. This is a setup sample, not a latency guarantee.
- Headless service memory sample: 115,978,240 bytes. No display or GPU renderer is installed for the service.
- Model gateway: server-held dedicated key configured; authenticated catalogue returned eight models. Production inference was not exercised.
- Empty setup verified after final installation: no save/crew, runs, pending permissions, goals or scheduled jobs. Test work stayed in temporary fixtures and was removed.
- Native visual inspection remains blocked by the locked Mac. No other requested work is queued into LevOS or into the station.
