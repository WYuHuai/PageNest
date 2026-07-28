@echo off
setlocal
cd /d "%~dp0local-server"
where python >nul 2>nul
if errorlevel 1 (echo ERROR: Python 3.11 or newer is required. & pause & exit /b 1)
python -c "import sys; raise SystemExit(0 if sys.version_info >= (3,11) else 1)" >nul 2>nul
if errorlevel 1 (echo ERROR: Python 3.11 or newer is required. & pause & exit /b 1)
if not exist .venv python -m venv .venv
if errorlevel 1 (echo ERROR: Could not create the virtual environment. & pause & exit /b 1)
call .venv\Scripts\activate.bat
python -m pip install --disable-pip-version-check --retries 5 --timeout 60 --prefer-binary -r requirements.txt
if errorlevel 1 (echo ERROR: Dependency installation failed. & pause & exit /b 1)
if not exist .env copy .env.example .env >nul
echo Installation completed. Configuration file: local-server\.env
pause
