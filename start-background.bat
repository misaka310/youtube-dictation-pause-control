@echo off
cd /d "%~dp0"

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
    exit /b 1
)

:: 2. Validate AHK Script syntax before proceeding
"%AHK_EXE%" /Validate "ahk\youtube-dictation-control.ahk"
if %errorlevel% neq 0 (
    exit /b %errorlevel%
)

:: 3. Check if Server is already running on port 17654 using case-insensitive check
netstat -ano | findstr /i "17654" >nul 2>nul
if %errorlevel% neq 0 (
    start "YouTube Dictation Server" /min cmd.exe /c "server\start-server.bat"
)

:: 4. Verify Server health status (up to 6 attempts) using native curl and ping
set "SERVER_OK=0"
for /l %%i in (1,1,6) do (
    ping 127.0.0.1 -n 2 > nul
    curl -s --max-time 1 http://127.0.0.1:17654/health | findstr "youtube-dictation-pause" >nul 2>nul
    if %errorlevel% equ 0 (
        set "SERVER_OK=1"
        goto :server_healthy
    )
)

:server_healthy
if "%SERVER_OK%"=="0" (
    exit /b 1
)

:: 5. Launch AutoHotkey Script
start "" "%AHK_EXE%" "ahk\youtube-dictation-control.ahk"
exit /b 0
