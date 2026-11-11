@echo off
echo Setting up Academic Performance Estimator...

if not exist venv (
    python -m venv venv
)
call "venv\Scripts\activate.bat"

python -m pip install -r requirements.txt

if not exist config.py (
    copy config.example.py config.py
    echo.
    echo ============================================================
    echo  config.py created. Edit it now with your MySQL username
    echo  and password, then re-run this script.
    echo ============================================================
    echo.
    pause
    exit /b
)

echo Ensure the database migration has been run after making a backup.
echo Starting the app. Your Microsoft client secret will be requested privately.
python -m tools.run_local
pause
