@echo off
set "ROOT_DIR=%~dp0"
for %%I in ("%ROOT_DIR%") do set "ROOT_DIR=%%~fI"
cd /d "%ROOT_DIR%"

title YouTube Dictation Pause Control - Stop Services
cls

echo ==========================================================
echo  YouTube Dictation Pause Control - Stop Services
echo ==========================================================
echo.
echo  Stopping only processes started by this tool.
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT_DIR%\scripts\windows\stop-tracked-processes.ps1" -RootDir "%ROOT_DIR%"

if %errorlevel% equ 0 (
    echo.
    echo ==========================================================
    echo  [SUCCESS] Stop command completed.
    echo ==========================================================
) else (
    echo.
    echo ==========================================================
    echo  [ERROR] Stop command failed.
    echo ==========================================================
)

echo.
pause
