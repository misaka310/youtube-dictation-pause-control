# Public Release Checklist

## Done in this cleanup

- [x] Rewrote README for public readers.
- [x] Removed personal absolute paths from public docs.
- [x] Replaced over-strong stability claims with explicit limitations.
- [x] Added MIT license.
- [x] Added security notes.
- [x] Added `package.json` and a Node-only smoke API test.
- [x] Added `config/settings.example.json`.
- [x] Removed tracked `config/settings.json`; local user config is ignored by Git.
- [x] Documented that runtime logs and PID files are ignored by Git.
- [x] Moved autostart helper scripts under `scripts/windows/`.
- [x] Changed `stop.bat` to stop only PID-tracked processes started by this tool.

## Check before making the GitHub repository public

- [ ] Confirm `config/settings.json` is not tracked.
- [ ] Confirm `logs/control.log` is not tracked.
- [ ] Confirm `runtime/` is not tracked.
- [ ] Re-read `README.md` from the GitHub preview page.
- [ ] Run `npm test` on Windows.
- [ ] Run `start.bat` manually on Windows with Brave and AutoHotkey v2 installed.
- [ ] Load `extension/` in Brave and complete `docs/e2e-checklist.md`.
- [ ] Run `scripts/windows/setup-autostart.bat` and `scripts/windows/remove-autostart.bat` once.
- [ ] Run `stop.bat` while another AutoHotkey script is running and confirm it is not stopped.
- [ ] Confirm no screenshots, personal paths, local-only logs, or local-only settings are committed.
