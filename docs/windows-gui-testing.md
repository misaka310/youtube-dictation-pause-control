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

## GitHub-hosted runner

This public repository runs the GUI smoke on GitHub-hosted `windows-latest`, so it does not consume private-repository Actions minutes or require the 74 self-hosted VM. The job runs for pull requests and can also be started with `workflow_dispatch`.

The smoke still requires an interactive Windows desktop. The test fails explicitly when the runner session is non-interactive, when another packaged controller is already running, or when UI Automation cannot reach the notification-area menu.

## Results

Success prints one `PASS` line per scenario. Failure exits non-zero and saves JSON plus a desktop screenshot under:

```text
test-results/windows-gui-smoke/
```

The workflow uploads those artifacts only on failure.
