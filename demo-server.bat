@echo off
setlocal
cd /d "%~dp0"
if not exist "venv\Scripts\python.exe" (
  echo Run setup.bat first to install the project dependencies.
  pause
  exit /b 1
)
"venv\Scripts\python.exe" -m tools.run_demo
pause
