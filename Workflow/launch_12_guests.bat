@echo off
echo Opening 12 guest tabs to localhost:3000...
for /l %%i in (1,1,12) do start msedge "http://localhost:3000/?guest=TestPlayer%%i"
echo Done.
