@echo off
title YouTube Dictation Pause Control - Stop Services
cls

echo ==========================================================
echo  YouTube Dictation Pause Control - Stop Services
echo ==========================================================
echo.
echo  Stopping all active AHK scripts and local HTTP Bridge Servers...
echo.

:: Stop AHK processes and Node Server on port 17654 (both local and remote socket connections)
powershell -Command "echo 'Stopping AutoHotkey instances...'; Stop-Process -Name 'AutoHotkey*' -Force -ErrorAction SilentlyContinue; echo 'Stopping Node.js server on port 17654...'; Get-NetTCPConnection | Where-Object { $_.LocalPort -eq 17654 -or $_.RemotePort -eq 17654 } | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"

echo.
echo ==========================================================
echo  [SUCCESS] All services stopped successfully!
echo ==========================================================
echo.
pause
