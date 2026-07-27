@echo off
setlocal
powershell -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8765/status' -TimeoutSec 3; Write-Host 'Collector is running:' $r.StatusCode -ForegroundColor Green; Start-Process 'http://127.0.0.1:8765/status' } catch { Write-Host 'Collector is not running. Run the start script.' -ForegroundColor Red }"
pause
