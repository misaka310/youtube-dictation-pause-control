@echo off
set "ROOT_DIR=%~dp0..\.."
for %%I in ("%ROOT_DIR%") do set "ROOT_DIR=%%~fI"

wt.exe -w 0 new-tab --title "YouTube Dictation Server" --startingDirectory "%ROOT_DIR%" cmd.exe /k "server\start-server.bat"
