# StarNet Remote

Private hard fork of androoAGI/starnet at 6e076c5d28895d19f938c9eaadc5e1fe21178cf3.
Upstream history, MIT license and notices are retained.

## Active release: persistent LevServer station

- [x] Inspect upstream lifecycle, persistence, authentication and existing server access.
- [x] Create the independent private thatlev/starnet repository.
- [x] Add a small Linux CLI, isolated service and GitHub-authenticated gateway over pinned SSH.
- [x] Keep runs, delegation and station sessions working without the Mac renderer; reconcile live events and durable state on reconnect.
- [ ] Build and install the Mac remote station client; leave production empty, with no agent tasks or schedules.
- [x] Verify authentication refusals, disconnect/reconnect, explicit cancellation, replay, persistence and Linux resource use with isolated fixtures.
- [ ] Review, push main and install the release through its health gate.

The server owns execution and durable station state. The Mac owns rendering and user input.
Never automatically replay an interrupted tool or model run after a server crash.
Recovery must use the existing explicit continuation/review flow. Closing the Mac app is not a server crash.
Do not seed or run agent tasks on the installed station during setup.

Standing goals were included in the active release after inspection found their upstream continuation loop depended on the Mac. The remote driver reuses the bounded state machine and existing authenticated run path. No production goals are created.

Native visual acceptance is pending because the Mac is locked. This does not block source, headless lifecycle tests or authenticated connection checks; do not describe it as visually verified.
