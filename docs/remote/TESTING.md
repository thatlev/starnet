# Remote provider acceptance

The candidate merges upstream v0.12.3 and adds durable remote provider settings. The official upstream PR waits for Lev's acceptance. Keep existing keys and endpoints; these checks do not require a new subscription or paid inference.

1. Open **StarNet Remote** from Applications. Your existing station should open directly. The first connected opening migrates any old browser-held provider settings to the server. A provider reporting exhausted quota must not send you back to “Revive your agent.”
2. Open **Settings → Providers** immediately. Scroll near the bottom and keep moving up/down for at least 30 seconds while status labels load. Open an **ADD KEY** editor and type harmless, unsaved text. The list should not jump and the editor should stay open with its text and focus. Clear that test text without saving it.
3. Check your configured providers and the custom GLM endpoint/model ID. Switch between existing providers as usual; the custom model must stay selected even when the provider catalog fails or omits its ID.
4. Quit the app completely with **Command-Q**, reopen it, and repeat once. Provider settings and your station should still be present without entering keys again. Rebuilding or replacing the Mac app uses the same server settings.
5. If an existing key is already exhausted, open that agent's station and Settings normally. Any provider quota error should remain an operation/status error, not an application boot failure. No paid model request is needed to verify opening and persistence.

Report any jump with the settings section, elapsed time after opening, and whether an editor was open. For provider issues, share the provider name, model ID and error message; do not share the API key.

Automated verification already exercises a synthetic 429 provider, process restart, two providers, custom endpoints, failed persistence, stale migration after removal, authenticated writes, and no credential readback. A delayed-provider browser check ran for 32 seconds with scroll and draft assertions. These checks do not substitute for the installed Mac acceptance above. The entire upstream test suite has separate known failures documented in PROJECT.md.
