# Public Release Checklist

## Completed for the tray-resident release

- [x] Added a self-contained `YouTubeDictationControl.exe`; release users do not install AutoHotkey separately.
- [x] Added a notification-area menu for status, bridge restart, state reset, log opening, Windows startup, and exit.
- [x] Replaced persistent terminal startup with hidden direct `node.exe server/server.js` launch.
- [x] Added owned-process verification, health monitoring, failure debounce, restart throttling, and automatic bridge recovery.
- [x] Confirmed normal controller exit stops only its owned Node.js bridge.
- [x] Added reproducible Windows release building with pinned official AutoHotkey and Ahk2Exe archives and SHA-256 verification.
- [x] Added `THIRD_PARTY_NOTICES.md`, the AutoHotkey GPL-2.0 text, and the exact corresponding AutoHotkey source archive to release packages.
- [x] Confirmed release staging excludes `config/settings.json`, runtime logs, PID files, Git metadata, tests, build cache, and developer scripts.
- [x] Built the Windows x64 EXE and ZIP successfully on Windows.
- [x] Ran `verify-release-runtime.ps1` and confirmed health, direct parent-child ownership, recovery to a new Node PID, and owned shutdown.
- [x] Ran the stop path with unrelated Node.js and AutoHotkey processes and confirmed both remained running.
- [x] Generated and re-read an autostart shortcut and confirmed its target, working directory, and icon.
- [x] Updated README and E2E documentation for the notification-area UX.

## Required before publishing a GitHub Release asset

- [ ] Run `npm test` from the final commit on Windows.
- [ ] Build the final ZIP from the final commit with `scripts/windows/build-release.ps1`.
- [ ] Re-run `scripts/windows/verify-release-runtime.ps1` against the final staged package.
- [ ] Inspect the final ZIP file list and confirm no local-only files are present.
- [ ] Confirm the GitHub Actions checks pass on the pull request.

## Manual browser and user-interaction checks

These checks require a real visible Windows session, Brave/Chromium, YouTube, and Typeless or Wispr Flow. Automated Node.js and packaged-runtime verification must not be recorded as completion of these cases.

- [ ] Load the packaged `extension/` folder in Brave and complete `docs/e2e-checklist.md`.
- [ ] Confirm the notification-area icon and each menu action visually.
- [ ] Toggle `Start with Windows` on and off and inspect the startup shortcut.
- [ ] Run the tool while an unrelated Node.js process and unrelated AutoHotkey script are active; confirm neither is stopped.
- [ ] Re-read the rendered README and third-party notices on GitHub.
