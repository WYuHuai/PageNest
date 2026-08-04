@echo off
setlocal
cd /d "%~dp0local-server"
if not exist .venv\Scripts\python.exe (echo ERROR: Run the dependency installer first. & pause & exit /b 1)
if not exist .env (copy .env.example .env >nul & echo ERROR: Configure local-server\.env first. & pause & exit /b 1)
set "VAULT="
set "PAGENEST_PORT=8765"
set "PAGENEST_TOKEN="
for /f "tokens=1,* delims==" %%A in ('findstr /b /c:"OBSIDIAN_VAULT_PATH=" .env') do set "VAULT=%%B"
for /f "tokens=1,* delims==" %%A in ('findstr /b /c:"PAGENEST_PORT=" .env') do set "PAGENEST_PORT=%%B"
for /f "tokens=1,* delims==" %%A in ('findstr /b /c:"LOCAL_COLLECTOR_TOKEN=" .env') do set "PAGENEST_TOKEN=%%B"
if not defined VAULT (echo ERROR: OBSIDIAN_VAULT_PATH is empty. & pause & exit /b 1)
netstat -ano | findstr /c:"127.0.0.1:%PAGENEST_PORT%" | findstr "LISTENING" >nul
if not errorlevel 1 (
  powershell -NoProfile -Command "try { $h=@{Authorization='Bearer %PAGENEST_TOKEN%'}; $r=Invoke-RestMethod 'http://127.0.0.1:%PAGENEST_PORT%/api/health' -Headers $h -TimeoutSec 3; if(-not $r.ok){exit 1} } catch { exit 1 }"
  if not errorlevel 1 (start "" http://127.0.0.1:%PAGENEST_PORT%/status & exit /b 0)
  echo ERROR: Port %PAGENEST_PORT% is already in use. Choose another PAGENEST_PORT in .env.
  pause
  exit /b 1
)
if not exist logs mkdir logs
start "PageNest" /min cmd /c "".venv\Scripts\python.exe" run.py 1^>logs\server.log 2^>logs\error.log"
timeout /t 4 /nobreak >nul
netstat -ano | findstr /c:"127.0.0.1:%PAGENEST_PORT%" | findstr "LISTENING" >nul
if errorlevel 1 (echo ERROR: Service failed to start. Open local-server\logs\error.log. & pause & exit /b 1)
start "" http://127.0.0.1:%PAGENEST_PORT%/status
echo Collector started at http://127.0.0.1:%PAGENEST_PORT%/status
exit /b 0
