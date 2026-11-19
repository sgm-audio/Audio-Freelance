@echo off
setlocal EnableDelayedExpansion

REM ================================================================
REM  Audio-Freelance — one-click launcher (wrapper around run.py)
REM ================================================================
REM Double-click to start backend (:8080) + frontend (:3000) and open
REM the dashboard. No venv activation or shell guesswork needed.
REM
REM First-time setup is one command:  python run.py install
REM The app uses the Python 3.14 environment pinned in .python-version.
REM ================================================================

cd /d "%~dp0"

REM Neutralize any stale VIRTUAL_ENV so uv targets the project's .venv.
set "VIRTUAL_ENV="

REM Bootstrap uv if it isn't on PATH.
where uv >nul 2>&1 || (
    echo Installing uv...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://astral.sh/uv/install.ps1 | iex"
    echo.
    echo uv installed. Please re-run start.bat so it is on PATH.
    goto :eof
)

REM Bootstrap Node.js if missing.
where node >nul 2>&1 || (
    echo Installing Node.js...
    winget install OpenJS.NodeJS.LTS
    echo.
    echo Node.js installed. Please re-run start.bat so it is on PATH.
    goto :eof
)

uv run python run.py %*
