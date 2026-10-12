# Connect a remote StarNet station

StarNet is one desktop app. **This Computer** uses the original local runtime, onboarding and keychain. A saved **server** (shown by the name you give it, for example **LevServer**) connects another computer or a private gateway. In server mode, that computer owns your agent, provider keys, files and running work; closing the Mac app leaves the server running. The connection chooser currently ships on macOS; other desktop platforms retain their original local behavior.

## Desktop setup

Open **Station → Connection Setup…** (Command-K). A fresh installation opens this screen automatically. Once a server is saved, launching StarNet opens that server directly and never shows this screen by itself: while the connection is coming up the opening page says "Connecting to LevServer…", and if the server or the network is down it says "LevServer offline — retrying" and keeps retrying, then opens the station the moment it is reachable. The same screen is one click away on that page (**Connection Setup**), from the Station menu and from **Gateway → Connection Settings**.

1. Your server comes first; **This Computer** is the second choice, for the original local station. Server setup defaults to **New Server** on a fresh installation; a saved connection selects **Already Installed** and retains its address and **Name**. The name is optional and only changes what StarNet calls the server; renaming never changes its saved origin, drafts or pairing.
2. Sign in with GitHub. Complete the device-code flow in your browser. The gateway accepts only its configured GitHub owner; the app does not ask you to find a numeric account ID.
3. Enter an SSH alias or `user@hostname`. Existing SSH configuration and keys work. Connection options allow an SSH port override and an existing gateway's port.
4. Use **Set up SSH access in Terminal** if this is your first connection. Verify the fingerprint against your server provider/administrator. Add your public key to the server or unlock it in your SSH agent as needed. Automatic connections use key authentication and strict host-key checking; a changed fingerprint is never silently accepted.
5. Choose **Test & save connection**, then **Open your station**. The test checks SSH, GitHub ownership, runtime health, the state snapshot and the live event stream. It does not run an agent or spend model credits.

Failed and cancelled checks leave the saved connection unchanged. If the connection drops while the station is open, the helper reconnects SSH with a bounded backoff and signs in to the gateway again on its own; the status control at the bottom right (Gateway) shows the server's name and, while it is out of reach, one plain line ("LevServer offline — retrying"). A window reloaded during an outage shows the same line and opens the station again by itself. Settings persist outside the application bundle, so rebuilding does not reset them. Each server/account combination receives a separate browser origin; returning to a previous connection reuses its origin. Existing installations retain port 8790. The retired Mac viewer’s stored StarNet drafts/preferences are imported once, only for their matching origin and only when a key is absent; original data remains intact. Local station storage is kept separate. New origins start at port 30000. The setup helper uses loopback port 18790 on a separate origin with strict Host/Origin and CSRF checks.

GitHub CLI handles sign-in storage on the Mac. The token is sent through authenticated SSH to verify ownership, then discarded by the gateway. Provider credentials stay in the server's private provider store. Do not paste provider tokens into the SSH form.

## A new server

Use a Linux x86_64 or arm64 machine with systemd, SSH, a working network connection and root/sudo access. The package bundles Node and the locked runtime dependencies; Node/npm installation on the server is not required. Normal work needs no display or GPU. See [operations](OPERATIONS.md) for limits and optional tool dependencies.

Choose **Open server installer in Terminal**. The viewer transfers its bundled, reviewed server archive over SSH, extracts it in a private temporary directory and invokes the installer with your signed-in GitHub owner ID. Terminal shows progress and asks for sudo when necessary. Closing the setup screen does not cancel a Terminal installer already launched.

The installer creates a `starnet` service account, immutable releases under `/opt/starnet`, private data under `/var/lib/starnet`, and `starnet-remote.service`. Gateway port 18791 and runtime port 18792 bind only to server loopback. Do not expose either through a public firewall. The installer refuses to replace a running service. Existing-station upgrades use the explicit idle/backup procedure in [operations](OPERATIONS.md).

When Terminal reports success, return to the viewer and test the connection. Configure model providers inside the station under **Settings → Providers**, or a private model gateway under **Settings → Gateway** ([gateway guide](GATEWAY.md)). An empty machine gets normal StarNet character onboarding; an existing station resumes its stored character and progress.

## Build and distribute a candidate

From a reviewed checkout on the target Mac architecture:

```sh
bash remote/install-mac.sh
```

The build includes pinned Node and GitHub CLI binaries verified against their official release checksums, their license notices, and a server archive containing only Git-tracked runtime sources plus locked dependencies. It includes both supported Linux architectures. Build tools (Node/npm, Rust, Xcode command-line tools, tar and unzip) are needed only on the packaging Mac. Fresh users do not need Homebrew, Node or GitHub CLI installed separately.

`Contents/Resources/REMOTE-BUILD.json` records the runtime versions, architecture and server archive checksum. `SOURCE_REVISION` records the reviewed source revision. `remote/package.mjs` stages reproducible inputs under `work/remote-package/`; it refuses bundled workspace state. Stage new source files before a candidate build; release builds should use a clean committed checkout.

The current script makes an ad-hoc signed developer candidate. Public distribution still requires the maintainer's Developer ID signing/notarization and release upload. No public download is claimed to exist before that release is published. Setup uses the station’s actual component styles, local VT323 font and ASCII wordmark. These assets are copied byte-for-byte from `frontend/`; `setup.css` only arranges the connection fields. The original Tauri shell hosts separate local, setup and remote windows. Only its bundled local window can call native commands; remote HTML has no local keychain or tool authority. No second desktop app is installed. The installer preserves previous app bundles under `work/mac-build/replaced-apps/`.

## Design reference

[Hermes Desktop's official guide](https://hermes-agent.nousresearch.com/docs/user-guide/desktop) distinguishes local setup from an existing remote backend, preserves existing configuration and validates remote connectivity. StarNet follows those interaction principles with its own GitHub-owner authentication, pinned SSH transport and SSE runtime. It does not import Hermes code or add a cloud-account dependency.
