# StarNet Remote

Private hard fork for Lev: build and view your agent station on the Mac; run the agents, tools, delegation, workflows and standing goals on LevServer. Closing the Mac app disconnects the viewer while server work continues.

The Linux service needs Node.js 22+ and a small, locked JavaScript validator dependency. It runs without a display, GPU, game renderer or local speech models. The Mac renders the original StarNet station in a thin native window, with streamed runtime events over a private SSH connection.

## Installed setup

- Mac: **StarNet Remote.app** in Applications. GitHub sign-in uses the existing GitHub CLI OAuth application and verifies account `thatlev` by numeric ID.
- Linux: **starnet-remote.service**, a dedicated unprivileged `starnet` user, and `starnet status` CLI. State resides in the encrypted private vault.
- Model access: the existing LevServer Responses gateway, with a dedicated StarNet key held only on the server. Select **LEVSERVER** when creating your crew.
- Private transport: pinned, key-authenticated `lev-server-direct` SSH; loopback gateway on 18791, runtime on 18792, Mac viewer on 8790. No public ingress.
- Setup ships empty: no crew, tasks, goals, schedules or model runs are seeded.

Create your station and crew in the Mac app. Let changes finish saving before quitting. A task accepted by the server continues without the app. Reopen the app to recover the durable station, transcripts and live activity. Pending permission requests still need your decision and deny on timeout. Explicit **Stop** cancels work.

Standing `/goal` loops also belong to the server. `/goal status`, `/goal pause`, `/goal resume`, `/goal clear` and `/subgoal` use the durable remote driver. A server crash pauses unfinished goals for explicit review; it never silently repeats an uncertain operation.

## Install from source

Linux, from a reviewed checkout or archive, with Node.js and npm already installed:

```sh
sudo remote/install-linux.sh YOUR_NUMERIC_GITHUB_ID /var/lib/starnet
starnet status
```

For this LevServer installation, use `/srv/private/starnet` after unlocking the vault. `remote/configure-levserver-provider.sh` is a LevServer-specific, root-only bootstrap for a dedicated model key; it preserves an existing configuration and refuses duplicate or uncertain key creation.

Mac, with Node.js, GitHub CLI, Swift command-line tools and the pinned SSH alias configured:

```sh
gh auth login --hostname github.com --web
bash remote/install-mac.sh
open '/Applications/StarNet Remote.app'
```

The native client is a local, ad hoc signed build. It contains only the viewer and connection client. It does not start the upstream Mac agent runtime.

See [architecture, operation and verification](docs/remote/OPERATIONS.md) for upgrade, recovery, safety boundaries and tests.

## Upstream and licensing

Based on [androoAGI/starnet](https://github.com/androoAGI/starnet), upstream commit `6e076c5d28895d19f938c9eaadc5e1fe21178cf3`. This is an independent **private** repository; GitHub's public-fork network does not support making a public fork private. Original history, [MIT license](LICENSE), attribution and [notices](NOTICE.md) are retained. The [upstream README](docs/remote/UPSTREAM-README.md) is preserved as historical documentation; its public release/install links belong to upstream.

Upstream release workflows are retired from this private branch (their original source remains in Git history), and GitHub Actions are disabled. They do not publish releases or start agents.
