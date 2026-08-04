@echo off
setlocal
set "PAGENEST_PORT=8765"
for /f "tokens=1,* delims==" %%A in ('findstr /b /c:"PAGENEST_PORT=" "%~dp0local-server\.env" 2^>nul') do set "PAGENEST_PORT=%%B"
powershell -NoProfile -Command "try { $u='http://127.0.0.1:%PAGENEST_PORT%/status'; $r=Invoke-WebRequest -UseBasicParsing $u -TimeoutSec 3; if($r.Content -notmatch 'PageNest'){throw 'Unexpected service'}; Write-Host 'Collector is running:' $r.StatusCode -ForegroundColor Green; Start-Process $u } catch { Write-Host 'Collector is not running on port %PAGENEST_PORT%.' -ForegroundColor Red }"
pause
