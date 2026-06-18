@echo off
cd /d "%~dp0"
echo Stopping any previous server on port 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000"') do (
    taskkill /f /pid %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul
echo Starting Hold Your Ground...
start http://localhost:3000
node server.js
pause
