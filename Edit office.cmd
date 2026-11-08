@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-office.ps1" -NoBrowser
if errorlevel 1 goto failed
start "" "http://127.0.0.1:5173"
call npm run dev
exit /b
:failed
pause
