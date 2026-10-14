@echo off
setlocal
set "ROOT_DIR=%~dp0..\.."
for %%I in ("%ROOT_DIR%") do set "ROOT_DIR=%%~fI"
cd /d "%ROOT_DIR%"

set "YDP_SHORTCUT_PATH=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\YouTube Dictation Pause Control.lnk"
set "YDP_WORKING_DIR=%ROOT_DIR%"
set "YDP_ARGUMENTS="

if exist "%ROOT_DIR%\YouTubeDictationControl.exe" (
    set "YDP_TARGET_PATH=%ROOT_DIR%\YouTubeDictationControl.exe"
) else (
    set "YDP_TARGET_PATH=%ROOT_DIR%\scripts\windows\start-background.bat"
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT_DIR%\scripts\windows\create-autostart-shortcut.ps1"
if errorlevel 1 (
    echo [ERROR] Failed to register startup.
    pause
    exit /b 1
)

echo [SUCCESS] Startup registered: %YDP_TARGET_PATH%
pause
exit /b 0
