@echo off
cd /d "%~dp0"
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

set "SHORTCUT_PATH=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\YouTubeDictationPause.lnk"
set "TARGET_PATH=%~dp0start-background.bat"
set "WORKING_DIR=%~dp0"

echo  Creating shortcut...
powershell -Command "$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%SHORTCUT_PATH%'); $Shortcut.TargetPath = '%TARGET_PATH%'; $Shortcut.WorkingDirectory = '%WORKING_DIR%'; $Shortcut.Save()"

if %errorlevel% equ 0 (
    echo.
    echo ==========================================================
    echo  [SUCCESS] Autostart registered successfully!
    echo ==========================================================
    echo.
    echo  * Shortcut saved in: Startup folder
    echo  * Target: %TARGET_PATH%
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
