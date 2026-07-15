@echo off
cd /d "%~dp0"
title YouTube Dictation Pause Control - Startup
cls

echo ==========================================================
echo  YouTube Dictation Pause Control Startup Script
echo ==========================================================
echo.

:: 1. AutoHotkey v2 executable path discovery
set "AHK_EXE="
if exist "C:\Program Files\AutoHotkey\v2\AutoHotkey64.exe" (
    set "AHK_EXE=C:\Program Files\AutoHotkey\v2\AutoHotkey64.exe"
) else if exist "C:\Program Files\AutoHotkey\v2\AutoHotkey32.exe" (
    set "AHK_EXE=C:\Program Files\AutoHotkey\v2\AutoHotkey32.exe"
) else if exist "C:\Program Files\AutoHotkey\AutoHotkey.exe" (
    set "AHK_EXE=C:\Program Files\AutoHotkey\AutoHotkey.exe"
) else (
    where AutoHotkey.exe >nul 2>nul
    if %errorlevel% equ 0 (
        set "AHK_EXE=AutoHotkey.exe"
    )
)

if "%AHK_EXE%"=="" (
    echo [ERROR] AutoHotkey v2 executable could not be found.
    echo Please ensure AutoHotkey v2 is installed on your system.
    echo.
    pause
    exit /b 1
)

:: 2. Validate AHK Script syntax before proceeding
echo [AHK] Checking script syntax validation...
"%AHK_EXE%" /Validate "ahk\youtube-dictation-control.ahk"
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] AutoHotkey script validation failed!
    echo Please open and fix the syntax errors in "ahk\youtube-dictation-control.ahk".
    echo.
    pause
    exit /b %errorlevel%
)
echo [AHK] Script validation passed successfully.
echo.

:: 3. Logs directory creation
if not exist "logs" (
    mkdir "logs"
)

:: 4. Start or migrate the local HTTP Bridge Server into Windows Terminal
echo [SERVER] Checking if local HTTP server is already running...
curl.exe -s --max-time 1 http://127.0.0.1:17654/health | findstr "youtube-dictation-pause" >nul 2>nul
if %errorlevel% equ 0 (
    echo [SERVER] Existing YouTube Dictation server detected.
    echo [SERVER] Stopping existing server so it can be reopened in Windows Terminal...
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "scripts\windows\stop-tracked-processes.ps1"
    ping 127.0.0.1 -n 2 > nul
)

echo [SERVER] Starting Local HTTP Bridge Server...
where wt.exe >nul 2>nul
if %errorlevel% equ 0 (
    echo [SERVER] Starting in Windows Terminal tab...
    call "scripts\windows\start-server-terminal-tab.cmd"
) else (
    echo [SERVER] Windows Terminal not found. Starting in a separate cmd window...
    start "YouTube Dictation Server" cmd.exe /k "server\start-server.bat"
)
echo.

:: 5. Validate Server health before continuing using clean string matching
echo [SERVER] Verifying local HTTP server health status...
set "SERVER_OK=0"
for /l %%i in (1,1,6) do (
    ping 127.0.0.1 -n 2 > nul
    curl -s --max-time 1 http://127.0.0.1:17654/health | findstr "youtube-dictation-pause" >nul 2>nul
    if %errorlevel% equ 0 (
        set "SERVER_OK=1"
        goto :server_healthy
    )
    echo [SERVER] Waiting for server response... (Attempt %%i/6)
)

:server_healthy
if "%SERVER_OK%"=="0" (
    echo.
    echo [ERROR] Local HTTP Bridge Server health check failed!
    echo Please ensure Node.js is running, and that port 17654 is not blocked.
    echo.
    pause
    exit /b 1
)
echo [SERVER] Server health check passed successfully.
echo.

:: 6. Remove tracked and orphaned instances of this AHK script
echo [AHK] Stopping prior matching AutoHotkey instances...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "scripts\windows\stop-tracked-processes.ps1" -AhkOnly
if %errorlevel% neq 0 (
    echo [ERROR] Failed to clean up prior AutoHotkey instances.
    exit /b %errorlevel%
)

:: 7. Launch AutoHotkey Script using the discovered executable path
echo [AHK] Starting AutoHotkey v2 Script...
start "" "%AHK_EXE%" "ahk\youtube-dictation-control.ahk"
ping 127.0.0.1 -n 2 > nul

echo.
echo ==========================================================
echo  [SUCCESS] All services launched!
echo ==========================================================
echo.
echo  * Local Server running on http://127.0.0.1:17654
echo  * AHK script active (Ctrl+Shift, Ctrl+], reset Ctrl+Alt+R)
echo  * Logs are saved in: logs\control.log
echo.
echo  Note: If you have not loaded the Brave extension,
echo  please load the "extension" folder at brave://extensions.
echo.
echo Press any key to open "logs/control.log" or close this window...
pause > nul
if exist "logs\control.log" (
    start "" notepad.exe "logs\control.log"
)
