@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\package_release.ps1"
if errorlevel 1 (
  echo ERROR: Release packaging failed.
  pause
  exit /b 1
)
echo Release candidate created under release\.
pause
