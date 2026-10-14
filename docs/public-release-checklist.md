# Public Release Checklist

## Completed for the tray-resident release

- [x] Added a self-contained `YouTubeDictationControl.exe`; release users do not install AutoHotkey separately.
- [x] Bundled the pinned official Node.js v24.18.0 Windows x64 runtime under `vendor/node`; release users do not install Node.js separately.
- [x] Added a notification-area menu for status, bridge restart, state reset, log opening, Windows startup, and exit.
- [x] Replaced persistent terminal startup with hidden direct `node.exe server/server.js` launch.
- [x] Added owned-process verification, health monitoring, failure debounce, restart throttling, and automatic bridge recovery.
- [x] Confirmed normal controller exit stops only its owned Node.js bridge.
- [x] Added reproducible Windows release building with pinned official AutoHotkey, Ahk2Exe, and Node.js archives and SHA-256 verification.
- [x] Added `THIRD_PARTY_NOTICES.md`, the AutoHotkey GPL-2.0 text, and the exact corresponding AutoHotkey source archive to release packages.
- [x] Confirmed release staging excludes `config/settings.json`, runtime logs, PID files, Git metadata, tests, build cache, and developer scripts.
- [x] Added a tag-triggered GitHub Actions Release workflow.
- [x] Added strict validation that `vX.Y.Z` matches the `package.json` version.
- [x] Added automatic ZIP and `SHA256SUMS.txt` publication.
- [x] Added idempotent asset replacement when the same workflow run is retried.
- [x] Updated README and maintainer documentation for automatic releases.

## Required before pushing a release tag

- [ ] Update `package.json` to the intended version.
- [ ] Update README, configuration examples, E2E instructions, and release notes affected by the change.
- [ ] Run `npm test` from the final branch commit on Windows.
- [ ] Build the final ZIP with `scripts/windows/build-release.ps1`.
- [ ] Run `scripts/windows/verify-release-runtime.ps1` against the final staged package and confirm `bundledNodeVersion` is `v24.18.0`, the bridge executable is the packaged `vendor/node/node.exe`, recovery succeeds, and owned shutdown succeeds.
- [ ] Inspect the final ZIP file list and confirm no local-only files are present.
- [ ] Confirm the pull request CI passes and merge it to `main`.
- [ ] Create the `vX.Y.Z` tag on the merged `main` commit and push it.

## Confirm after GitHub Actions publishes

- [ ] Confirm the `Release` workflow completed successfully.
- [ ] Confirm the GitHub Release is neither draft nor prerelease unless intentionally configured otherwise.
- [ ] Confirm `YouTubeDictationPauseControl-X.Y.Z-windows-x64.zip` is attached and contains `vendor/node/node.exe` plus `vendor/node/LICENSE`.
- [ ] Confirm `SHA256SUMS.txt` is attached and matches the ZIP digest.
- [ ] Confirm the Release tag resolves to the intended `main` commit.
- [ ] Re-read the rendered README, release notes, and third-party notices on GitHub.

## Manual browser and user-interaction checks

These checks require a real visible Windows session, Brave/Chromium, YouTube, and Typeless or Wispr Flow. Automated Node.js, packaged-runtime, and GitHub Actions verification must not be recorded as completion of these cases.

- [ ] Load the packaged `extension/` folder in Brave and complete `docs/e2e-checklist.md`.
- [ ] Confirm the notification-area icon and each menu action visually.
- [ ] Toggle `Start with Windows` on and off and inspect the startup shortcut.
- [ ] Run the tool while an unrelated Node.js process and unrelated AutoHotkey script are active; confirm neither is stopped.
