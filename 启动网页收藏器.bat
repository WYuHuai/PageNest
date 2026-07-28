@echo off
setlocal
cd /d "%~dp0local-server"
if not exist .venv\Scripts\python.exe (echo ERROR: Run the dependency installer first. & pause & exit /b 1)
if not exist .env (copy .env.example .env >nul & echo ERROR: Configure local-server\.env first. & pause & exit /b 1)
set "VAULT="
for /f "tokens=1,* delims==" %%A in ('findstr /b /c:"OBSIDIAN_VAULT_PATH=" .env') do set "VAULT=%%B"
if not defined VAULT (echo ERROR: OBSIDIAN_VAULT_PATH is empty. & pause & exit /b 1)
netstat -ano | findstr /c:"127.0.0.1:8765" | findstr "LISTENING" >nul
if not errorlevel 1 (start "" http://127.0.0.1:8765/status & exit /b 0)
if not exist logs mkdir logs
start "PageNest" /min cmd /c "".venv\Scripts\python.exe" run.py 1^>logs\server.log 2^>logs\error.log"
timeout /t 4 /nobreak >nul
netstat -ano | findstr /c:"127.0.0.1:8765" | findstr "LISTENING" >nul
if errorlevel 1 (echo ERROR: Service failed to start. Open local-server\logs\error.log. & pause & exit /b 1)
start "" http://127.0.0.1:8765/status
echo Collector started at http://127.0.0.1:8765/status
exit /b 0
