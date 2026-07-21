# Windows GUI smoke testing

The normal CI suite verifies JavaScript, AutoHotkey contracts, API behavior, release contents, and package buildability. It does not prove that a user can open and operate the compiled notification-area menu.

`npm run test:gui:windows` builds the release package and tests its real `YouTubeDictationControl.exe` with Windows UI Automation. Controls are selected by accessible names and control types rather than fixed screen coordinates.

## Scenarios

- the packaged controller starts and creates one tray instance;
- the expected menu items exist and are enabled;
- a duplicate launch still leaves one controller;
- Reset dictation state reaches the real handler;
- Restart local bridge starts a new owned Node bridge and leaves the menu operable;
- Open log opens the intended log viewer;
- Exit removes the controller and its owned Node bridge;
- a second launch remains operable and exits cleanly.

The test checks that **Start with Windows** exists and is enabled, but it deliberately does not change the test account's startup shortcut.

## Self-hosted runner

Run this only on a dedicated Windows 11 VM or test machine. The runner must:

- be started in a logged-in interactive desktop session, not as a Session 0 service;
- have the labels `self-hosted`, `windows`, `x64`, and `gui-automation`;
- allow the runner account to interact with the Windows taskbar;
- have no copy of the same packaged controller already running.

The workflow is committed before the runner is ready without leaving PR checks queued. Pull-request runs are enabled by setting the repository variable:

```text
GUI_SELF_HOSTED_ENABLED=true
```

An explicit first run can be started with `workflow_dispatch` after the runner is registered.

## Results

Success prints one `PASS` line per scenario. Failure exits non-zero and saves JSON plus a desktop screenshot under:

```text
test-results/windows-gui-smoke/
```

The workflow uploads those artifacts only on failure.
