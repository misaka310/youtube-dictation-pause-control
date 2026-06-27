@echo off
title YouTube Dictation Pause - Remove Autostart
cls

echo ==========================================================
echo  YouTube Dictation Pause Control - Remove Autostart
echo ==========================================================
echo.
echo  This script removes the autostart shortcut.
echo.

set "SHORTCUT_PATH=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\YouTubeDictationPause.lnk"

if exist "%SHORTCUT_PATH%" (
    del "%SHORTCUT_PATH%"
    echo ==========================================================
    echo  [SUCCESS] Autostart shortcut successfully removed.
    echo ==========================================================
    echo.
) else (
    echo  Autostart shortcut was not found in: Startup folder.
    echo  Nothing to do.
    echo.
)

pause
