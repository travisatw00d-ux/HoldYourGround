@echo off
echo Clearing previous diagnostic logs...
del /q "%~dp0diag-DiagPlayer.jsonl" 2>nul
start chrome "http://localhost:3000/?guest=DiagPlayer"
echo Opened DiagPlayer in Chrome
