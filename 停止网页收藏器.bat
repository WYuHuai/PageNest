@echo off
setlocal
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /c:"127.0.0.1:8765" ^| findstr "LISTENING"') do taskkill /PID %%P /T /F >nul 2>nul
echo Collector stopped. No Obsidian files were deleted.
pause
