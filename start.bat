@echo off
setlocal EnableDelayedExpansion

REM ================================================================
REM  Audio-Freelance — one-click launcher
REM ================================================================
REM Double-click this file. Everything else is automatic:
REM   * uses the project's own Python environment (uv) — no activation
REM   * creates .env from .env.example if it's missing
REM   * installs frontend dependencies if node_modules is missing
REM   * starts backend (FastAPI :8080) + frontend (Next.js :3000)
REM   * opens the dashboard in your browser
REM
REM No git-bash, no PowerShell activation, no separate frontend/backend
REM install, and no "which shell do I use" guesswork.
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
