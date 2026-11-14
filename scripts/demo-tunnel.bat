@echo off
setlocal
cd /d "%~dp0.."
where cloudflared >nul 2>&1
if errorlevel 1 (
  echo cloudflared was not found. See docs\DEMO_HOSTING.md for installation.
  pause
  exit /b 1
)
echo Starting a temporary public HTTPS tunnel to this PC.
echo Copy the https://...trycloudflare.com address shown below.
echo Keep this window open throughout the demo.
cloudflared tunnel --url http://127.0.0.1:5000
pause