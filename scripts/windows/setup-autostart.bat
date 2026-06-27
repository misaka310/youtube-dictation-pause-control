@echo off
set "ROOT_DIR=%~dp0..\.."
for %%I in ("%ROOT_DIR%") do set "ROOT_DIR=%%~fI"
cd /d "%ROOT_DIR%"

title YouTube Dictation Pause - Setup Autostart
cls

echo ==========================================================
echo  YouTube Dictation Pause Control - Autostart Setup
echo ==========================================================
echo.
echo  This script registers YouTube Dictation Pause Control to
echo  run automatically when Windows starts.
echo  (No Administrator rights required)
echo.

set "YDP_SHORTCUT_PATH=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\YouTubeDictationPause.lnk"
set "YDP_TARGET_PATH=%ROOT_DIR%\scripts\windows\start-background.bat"
set "YDP_WORKING_DIR=%ROOT_DIR%"

echo  Creating shortcut...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT_DIR%\scripts\windows\create-autostart-shortcut.ps1"

if %errorlevel% equ 0 (
    echo.
    echo ==========================================================
    echo  [SUCCESS] Autostart registered successfully!
    echo ==========================================================
    echo.
    echo  * Shortcut saved in: Startup folder
    echo  * Target: %YDP_TARGET_PATH%
    echo.
    echo  The services will run silently in the background
    echo  on your next Windows login.
    echo.
) else (
    echo.
    echo  [ERROR] Failed to register autostart shortcut.
    echo.
)

pause
