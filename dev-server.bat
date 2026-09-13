@echo off
echo Starting development server for acad-perf...
echo.
echo Choose an option:
echo 1. Python HTTP Server (recommended if Python is available)
echo 2. Node.js http-server (if Node.js/npm is available)
echo 3. Open files directly in browser (no server needed)
echo.
set /p choice="Enter your choice (1-3): "

if "%choice%"=="1" (
    echo.
    echo Starting Python server...
    cd /d "C:\Users\dwayn\Documents\VS\acad-perf"
    python -m http.server 8000
    echo Server started at http://localhost:8000
    echo Open http://localhost:8000/html/index.html in your browser
    echo.
    echo Press Ctrl+C to stop the server
    pause
) else if "%choice%"=="2" (
    echo.
    echo Starting Node.js server...
    cd /d "C:\Users\dwayn\Documents\VS\acad-perf"
    npx http-server -p 8000
    echo Server started at http://localhost:8000
    echo Open http://localhost:8000/html/index.html in your browser
    echo.
    echo Press Ctrl+C to stop the server
    pause
) else if "%choice%"=="3" (
    echo.
    echo Opening files directly in browser...
    start "" "C:\Users\dwayn\Documents\VS\acad-perf\html\index.html"
    echo Opened index.html in your default browser
    echo To open other files, navigate to the html/ folder and double-click them
    echo.
    pause
) else (
    echo Invalid choice. Please run the script again and enter 1, 2, or 3.
    pause
)