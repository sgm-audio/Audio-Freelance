@echo off
rem Windows wrapper for the cross-platform launcher.
python "%~dp0run.py" %*
set EXITCODE=%ERRORLEVEL%
if %EXITCODE% neq 0 (
    echo.
    echo Launcher failed with exit code %EXITCODE%.
    echo Re-run with: python run.py --verbose
    echo Or start frontend alone: cd frontend ^&^& npm run dev
    pause
)
exit /b %EXITCODE%
