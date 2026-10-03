# StarNet Remote

Public, unofficial fork of androoAGI/starnet, updated through v0.12.3 (`3ba5b84922f3b62caa4e159999ef3acc82af2a3e`) on its default `feat/harness-backend` branch.
Upstream history, MIT license and notices are retained. The public overview is [FORK.md](FORK.md); this file is the release log.

## Active release: menu bar icon and setup panel colour

- [x] Add Settings → Appearance → MENU BAR ICON (Monochrome default, Color), saved natively on the Mac with the lifecycle preferences and applied to the menu bar icon immediately. Pages reach it only through `starnet-connect://menu-bar-icon/monochrome|color`, handled by both the local and remote station windows; no other native authority is exposed.
- [x] Make the setup ("GET ACQUAINTED") panel use the theme's opaque panel colour instead of a fixed teal-black `#080b0b`, so it matches the COMMS panel it covers. The rule was identical to upstream; the station had been parked at a pending setup question, so the overlay was permanently visible.
- [ ] Rebuild and install the Mac app and server release; verify the icon, the setting and the panel colour.

## Next release (queued): agent-editable station configuration

Lev wants nearly everything — settings, rooms, maps and layouts — editable by agents through configuration or an equally simple surface, with every change visible and backed up. Upstream has moved 867 commits past this fork's v0.12.3 base and now ships a `station.layout` agent tool for floor edits, so the first step is merging current upstream rather than building a parallel layout editor. Placed objects are capability grants, so agent layout/permission edits must keep consent and remain auditable. Plan: merge upstream; expose a validated settings get/set tool with a change history visible in Settings; snapshot the station (the existing STATION BACKUP export, secrets excluded) before each agent-applied change with one-step restore; document the configuration surface for agents.

## Active release: Gateway settings section and public fork

- [x] Move the private model gateway out of Providers / API Keys into its own Settings → Gateway section, keeping its select, add-key, update, backups and remove controls.
- [x] Route the "no key" banner to Gateway when the gateway is the missing provider.
- [x] Fix Gateway spacing from Lev's installed-app review: add a gateway icon instead of an empty logo slot, separate the saved key into a GATEWAY KEY group, space the explanation from the card, and lay key actions out in a row that wraps below the credential when narrow.
- [x] Document the fork (FORK.md, docs/remote/GATEWAY.md, README notice, setup/operations/testing updates).
- [x] Rebuild and reinstall the Mac app and the server release; remove old builds.
- [x] Make the fork repository public after the history scan.

Installed: Mac and server source `2ed7b955e3389258a615ac509a96af7df8ab4373`. The Mac app passed deep/strict signature verification and its source stamp matches. The server passed the installer's runtime-health and unauthenticated-refusal gates; station data matched the pre-upgrade backup except the regenerated owner claim, and the served station UI contains the new section. The installed app showed Settings → Gateway with the verified key and Providers/API Keys without the gateway. Data backups: `/srv/private/starnet-upgrade-backups/90af4a36d1cce85fd53776b20dd9cab026140bea/` and `…/2ed7b955e3389258a615ac509a96af7df8ab4373/`; Mac client backups remain under `work/mac-build/client-backup-*`.

Old builds removed at Lev's request: all superseded server releases under `/opt/starnet/releases` (only `2ed7b955e` remains; any revision can be rebuilt from Git), and on the Mac the replaced app bundles, retired StarNet Remote bundles, temporary build folders and the debug bundle were moved to the Trash. Data backups were kept.

Observed: when the Mac app opens behind other windows, macOS throttles the occluded WebKit view and the station can show LINK DOWN until the window is brought forward; it then goes live within seconds. Safari and Chromium viewers of the same proxy were live, and the event stream, snapshot and session were healthy throughout.

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
