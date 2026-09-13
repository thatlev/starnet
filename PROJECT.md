# StarNet Remote

Private hard fork of androoAGI/starnet at 6e076c5d28895d19f938c9eaadc5e1fe21178cf3.
Upstream history, MIT license and notices are retained.

## Active release: persistent LevServer station

- [x] Inspect upstream lifecycle, persistence, authentication and existing server access.
- [x] Create the independent private thatlev/starnet repository.
- [x] Add a small Linux CLI, isolated service and GitHub-authenticated gateway over pinned SSH.
- [x] Keep runs, delegation and station sessions working without the Mac renderer; reconcile live events and durable state on reconnect.
- [x] Build and install the Mac remote station client; leave production empty, with no agent tasks or schedules.
- [x] Verify authentication refusals, disconnect/reconnect, explicit cancellation, replay, persistence and Linux resource use with isolated fixtures.
- [x] Review source and install the release through its health gate.

## Active follow-up: quiet gateway interface

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

Native visual acceptance is pending because the Mac is locked. This does not block source, headless lifecycle tests or authenticated connection checks; do not describe it as visually verified.

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
