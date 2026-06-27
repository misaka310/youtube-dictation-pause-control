# Public Release Checklist

## Done in this cleanup

- [x] Rewrote README for public readers.
- [x] Removed personal absolute paths from public docs.
- [x] Replaced over-strong stability claims with explicit limitations.
- [x] Added MIT license.
- [x] Added security notes.
- [x] Added `package.json` and a Node-only smoke API test.
- [x] Added `config/settings.example.json`.
- [x] Documented that runtime logs are ignored by Git.

## Check before making the GitHub repository public

- [ ] Confirm `logs/control.log` is not tracked. If it is tracked, remove it from the index before publishing.
- [ ] Re-read `README.md` from the GitHub preview page.
- [ ] Run `npm test` on Windows.
- [ ] Run `start.bat` manually on Windows with Brave and AutoHotkey v2 installed.
- [ ] Load `extension/` in Brave and complete `docs/e2e-checklist.md`.
- [ ] Confirm no screenshots, personal paths, or local-only logs are committed.
