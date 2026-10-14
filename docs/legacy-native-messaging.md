# Legacy Native Messaging (Deprecated)

This document is a historical note explaining the legacy **Native Messaging** approach and why it was replaced by the simpler **Local HTTP Bridge** architecture.

## What was the Native Messaging approach?

The old design used this flow:

1. **AutoHotkey v2** listened to dictation hotkeys.
2. **WM_COPYDATA** sent state transitions to a hidden native host window.
3. **Native Host** was launched by Brave through a registered Windows registry entry.
4. **Brave Background Service Worker** called `chrome.runtime.connectNative(...)` and controlled YouTube tabs.

## Why it was abandoned

Native Messaging avoids a local port, but it was too fragile for this small local utility.

1. **Service Worker lifecycle issues**
   - Manifest V3 background workers can suspend after inactivity.
   - Reconnect and alarm logic made timing problems harder to debug.

2. **Native Host discovery failures**
   - If Brave started before the AHK script, the host process could terminate or miss the expected window.
   - State delivery became dependent on startup order.

3. **Registry and absolute path fragility**
   - Native Messaging requires registry keys that point to a manifest JSON.
   - The manifest JSON must contain an absolute path to a wrapper executable or batch file.
   - Moving the project folder breaks the registration unless the registry is rewritten.

4. **Harder debugging**
   - Errors appeared in the service worker inspector or native process stderr.
   - This was not friendly for a double-click Windows tool.

## Reference snippets only

These snippets are intentionally generic. Do not copy them as-is.

### Legacy host manifest example

```json
{
  "name": "com.youtube.dictation.control",
  "description": "YouTube Dictation Pause Control Native Messaging Host",
  "path": "C:\\path\\to\\youtube-dictation-pause\\native-host\\host.bat",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://<your-extension-id>/"
  ]
}
```

### Legacy registry example

```batch
@echo off
REG ADD "HKCU\Software\Brave-Browser\NativeMessagingHosts\com.youtube.dictation.control" /ve /t REG_SZ /d "C:\path\to\youtube-dictation-pause\native-host\com.youtube.dictation.control.json" /f
```

## Current architecture

The current architecture uses a local HTTP bridge bound to `127.0.0.1` and a background service worker that fetches state from that bridge. It is easier to start, easier to test, and easier to explain publicly.
