@echo off
setlocal
set "PAGENEST_PORT=8765"
set "PAGENEST_TOKEN="
for /f "tokens=1,* delims==" %%A in ('findstr /b /c:"PAGENEST_PORT=" "%~dp0local-server\.env" 2^>nul') do set "PAGENEST_PORT=%%B"
for /f "tokens=1,* delims==" %%A in ('findstr /b /c:"LOCAL_COLLECTOR_TOKEN=" "%~dp0local-server\.env" 2^>nul') do set "PAGENEST_TOKEN=%%B"
powershell -NoProfile -Command "try { $h=@{Authorization='Bearer %PAGENEST_TOKEN%'}; $r=Invoke-RestMethod 'http://127.0.0.1:%PAGENEST_PORT%/api/health' -Headers $h -TimeoutSec 3; if(-not $r.ok){exit 1} } catch { exit 1 }"
if errorlevel 1 (echo Refusing to stop a service that is not authenticated as PageNest. & pause & exit /b 1)
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /c:"127.0.0.1:%PAGENEST_PORT%" ^| findstr "LISTENING"') do taskkill /PID %%P /T /F >nul 2>nul
echo Collector stopped. No Obsidian files were deleted.
pause
