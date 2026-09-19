# Remote provider acceptance

The candidate merges upstream v0.12.3 and adds durable remote provider settings. The official upstream PR waits for Lev's acceptance. Keep existing keys and endpoints; these checks do not require a new subscription or paid inference.

1. Open **StarNet Remote** from Applications. Your existing station should open directly. The first connected opening migrates any old browser-held provider settings to the server. A provider reporting exhausted quota must not send you back to “Revive your agent.”
2. Open **Settings → Providers** immediately. Scroll near the bottom and keep moving up/down for at least 30 seconds while status labels load. Open an **ADD KEY** editor and type harmless, unsaved text. The list should not jump and the editor should stay open with its text and focus. Clear that test text without saving it.
3. Check your configured providers and the custom GLM endpoint/model ID. Switch between existing providers as usual; the custom model must stay selected even when the provider catalog fails or omits its ID.
4. Quit the app completely with **Command-Q**, reopen it, and repeat once. Provider settings and your station should still be present without entering keys again. Rebuilding or replacing the Mac app uses the same server settings.
5. If an existing key is already exhausted, open that agent's station and Settings normally. Any provider quota error should remain an operation/status error, not an application boot failure. No paid model request is needed to verify opening and persistence.

Report any jump with the settings section, elapsed time after opening, and whether an editor was open. For provider issues, share the provider name, model ID and error message; do not share the API key.

Automated verification already exercises a synthetic 429 provider, process restart, two providers, custom endpoints, failed persistence, stale migration after removal, authenticated writes, and no credential readback. A delayed-provider browser check ran for 32 seconds with scroll and draft assertions. These checks do not substitute for the installed Mac acceptance above. The entire upstream test suite has separate known failures documented in PROJECT.md.

## Display and connection setup candidate (0.2.0)

1. Open the rebuilt **StarNet Remote**. Your existing server, character, custom model and keys should remain. A depleted provider must still let you open Settings.
2. Open **Settings → Providers**, scroll near the bottom immediately, and keep reading for 30 seconds. Repeat after a Gateway reconnect. There should be no upward shift or repeated card fade. Appearance → Screen Flicker remains available if you deliberately want the CRT effect.
3. Reopen an unfinished conversation. The right panel should use the classic dark presentation and compact choices. A suggestion opens an empty answer editor; it must not silently submit the suggestion. Type an unsent draft, reopen the app and confirm it is retained.
4. Open **StarNet Remote → Connection Setup…** (Command-K). Your SSH host is prefilled. **Check sign-in** should identify your GitHub account. **Test & save connection** should verify SSH, ownership, runtime and live events without sending a model request. **Open your station** should return to the same saved station.
5. Enter an unreachable test hostname or wrong port and test. Cancel a check too. Both must retain the prior saved connection; **Return to station** should still work. Restore the correct form details afterward.
6. The **new server** path is for a disposable/fresh Linux machine, not the existing station. Review the install details, launch the Terminal installer, then test and open the resulting empty station. The current package includes Linux x86_64 and arm64 runtimes; arm64 installation still needs hardware acceptance if only x86_64 was available during validation.

Public release signing/notarization and the official upstream PR are separate from this local candidate. Do not erase working data or revoke real provider keys merely to simulate a fresh install.
