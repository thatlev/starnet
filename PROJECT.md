# StarNet Remote

Private hard fork of androoAGI/starnet at 6e076c5d28895d19f938c9eaadc5e1fe21178cf3.
Upstream history, MIT license and notices are retained.

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
