@echo off
setlocal
cd /d "%~dp0.."
if not exist "venv\Scripts\python.exe" (
  echo Create the project virtual environment first: py -m venv venv
  pause
  exit /b 1
)
"venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 (
  pause
  exit /b 1
)
"venv\Scripts\python.exe" -m tools.microsoft_signin_check --prompt
pause
