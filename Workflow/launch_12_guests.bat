@echo off
setlocal enabledelayedexpansion
echo Clearing previous diagnostic logs...
del /q "%~dp0diag-*.jsonl" 2>nul
del /q "%~dp0diag-log.json" 2>nul
echo Opening 12 diagnostic guest tabs to localhost:3000...

for /l %%i in (1,1,12) do (
  set /a idx=%%i-1
  if %%i leq 6 (
    rem Monitor 1 (1920x1080) - 3x2 grid, 640x540 each
    set /a "col=idx %% 3"
    set /a "row=idx / 3"
    set /a "wx=col*640"
    set /a "wy=row*540"
    set "ws=640"
    set "hs=540"
  ) else (
    rem Monitor 2 (3440x1440) - 3x2 grid, ~1147x720 each, offset X by 1920
    set /a "local=idx-6"
    set /a "col=local %% 3"
    set /a "row=local / 3"
    set /a "wx=1920+col*1147"
    set /a "wy=row*720"
    set "ws=1147"
    set "hs=720"
  )
  start msedge --new-window "http://localhost:3000/?guest=TestPlayer%%i" --window-size=!ws!,!hs! --window-position=!wx!,!wy! --auto-open-devtools-for-tabs
)

echo Done. Watch the console output for [HYG] diagnostic messages.
