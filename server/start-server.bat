@echo off
cd /d "%~dp0"
title YouTube Dictation Pause - Node Server
echo Starting local HTTP Bridge Server on port 17654...
node server.js
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Failed to start Node.js server.
    echo Please make sure Node.js is installed and the port is not in use.
    pause
)
