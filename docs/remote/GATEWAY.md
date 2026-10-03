# Private model gateway

The **Gateway** provider connects StarNet to a model gateway you run yourself. It accepts
StarNet's model requests and serves them from model accounts connected on the gateway, such as
ChatGPT/Codex subscriptions shared across several tools. StarNet never sees those
account credentials. It holds only one gateway key.

Internally the provider id is `levserver` (named after the maintainer's server). In the app it is
called **Gateway**.

## Where it lives in the app

Open **Settings → Gateway**. It has its own section because it is infrastructure rather than
another model vendor. **Settings → Providers** and its **API Keys** list show only model
services.

| Control | What it does |
| --- | --- |
| Gateway card | Select the gateway as the active provider. Shows its status (no key, key saved, verified, check failed). |
| **＋ ADD KEY** | Shown on the card when no key is saved. Paste a gateway key; it is validated before it is stored. |
| **✎ UPDATE** | Replace the saved key. A failed validation keeps the old key. |
| **↻ BACKUPS** | Up to 8 backup keys, scoped only to the gateway. |
| **✕ REMOVE** | Removes the saved key after a second confirming click (it disarms after 5 seconds). |

If the gateway is your active provider and has no key, the station's "no key" banner opens this
section directly. Which models the key may use, its quotas and reserves are managed on the gateway
itself, not in StarNet.

## What the gateway must provide

The gateway speaks the OpenAI **Responses** API under a base URL that ends in `/v1`:

| Request | Purpose |
| --- | --- |
| `GET {base}/models` | The model catalogue. StarNet uses entries in `data[]` with a string `id`, skips `available: false`, and reads optional `allowed_reasoning_efforts`, `default_reasoning_effort` and `recommended`. |
| `POST {base}/responses` | Streaming model turns with tools, decoded by the same Responses stream decoder as the ChatGPT (Codex) provider. |

Both requests send `Authorization: Bearer <gateway key>`; the catalogue request refuses redirects. Reasoning efforts
`low`, `medium`, `high`, `xhigh`, `max` and `ultra` pass through unchanged; the default is
`medium`. The gateway's catalogue is authoritative. If it can't be read, StarNet reports the
error rather than substituting a static model list. Gateway runs are treated as unmetered:
StarNet does not price them per token, so use the gateway's own quotas for spending limits.

## Address and key

The default base URL is `http://127.0.0.1:8781/v1`, which is the loopback address of the machine running the
StarNet runtime. In remote mode that is the server, so a gateway on the same server needs no
public port. In local mode it is your own computer.

You can also configure the runtime through its environment. Each name is accepted bare or with a
`STARNET_` or `SKYNET_` prefix:

| Variable | Meaning |
| --- | --- |
| `LEVSERVER_KEY` | Gateway key. |
| `LEVSERVER_BASE_URL` | Base URL, for example `http://127.0.0.1:8781/v1`. |

The remote service loads optional variables from `provider.env` in its data directory (systemd
`EnvironmentFile`). Keep that file readable only by root. A key saved through **Settings →
Gateway** is stored on the server in remote mode, or in the OS keychain when the desktop app runs
locally. It is always shown masked.

`remote/configure-levserver-provider.sh` is the maintainer's example for one particular gateway. It runs on
the server, creates a dedicated "StarNet Remote" key through that gateway's loopback admin API,
limited to its subscription models with a 1% account reserve, and writes the key straight into
the private `provider.env` without printing it. Adapt it to your gateway's admin API, or create a key by
hand and paste it into **Settings → Gateway**.

## Safety notes

- Keep the gateway bound to loopback, or behind your own authentication. Never expose it publicly
  without a key.
- Never paste the gateway key into chat, issues or logs. If it leaks, revoke it on the gateway and
  save a new one under **Settings → Gateway**.
- Removing the key in StarNet does not revoke it on the gateway.
