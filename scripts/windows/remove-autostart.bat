@echo off
setlocal
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "CURRENT_SHORTCUT=%STARTUP_DIR%\YouTube Dictation Pause Control.lnk"
set "LEGACY_SHORTCUT=%STARTUP_DIR%\YouTubeDictationPause.lnk"

if exist "%CURRENT_SHORTCUT%" del /f /q "%CURRENT_SHORTCUT%"
if exist "%LEGACY_SHORTCUT%" del /f /q "%LEGACY_SHORTCUT%"

echo [SUCCESS] Startup shortcuts removed if present.
pause
exit /b 0
