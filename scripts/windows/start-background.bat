@echo off
setlocal
set "ROOT_DIR=%~dp0..\.."
for %%I in ("%ROOT_DIR%") do set "ROOT_DIR=%%~fI"
cd /d "%ROOT_DIR%"

if exist "%ROOT_DIR%\YouTubeDictationControl.exe" (
    start "" "%ROOT_DIR%\YouTubeDictationControl.exe"
    exit /b 0
)

set "AHK_EXE="
if exist "C:\Program Files\AutoHotkey\v2\AutoHotkey64.exe" set "AHK_EXE=C:\Program Files\AutoHotkey\v2\AutoHotkey64.exe"
if not defined AHK_EXE if exist "C:\Program Files\AutoHotkey\v2\AutoHotkey32.exe" set "AHK_EXE=C:\Program Files\AutoHotkey\v2\AutoHotkey32.exe"
if not defined AHK_EXE if exist "C:\Program Files\AutoHotkey\AutoHotkey.exe" set "AHK_EXE=C:\Program Files\AutoHotkey\AutoHotkey.exe"
if not defined AHK_EXE for /f "delims=" %%I in ('where AutoHotkey.exe 2^>nul') do if not defined AHK_EXE set "AHK_EXE=%%I"
if not defined AHK_EXE exit /b 1

"%AHK_EXE%" /ErrorStdOut /Validate "%ROOT_DIR%\ahk\youtube-dictation-control.ahk"
if errorlevel 1 exit /b 1

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT_DIR%\scripts\windows\stop-tracked-processes.ps1" -AhkOnly >nul
if errorlevel 1 exit /b 1

start "" "%AHK_EXE%" "%ROOT_DIR%\ahk\youtube-dictation-control.ahk"
exit /b 0
