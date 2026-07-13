@echo off
rem Drop into the uv-managed venv (cmd.exe). 'exit' to leave.
if not exist "%~dp0.venv\Scripts\activate.bat" (
    echo No .venv found -- run 'uv sync' first.
    exit /b 1
)
cmd /k "%~dp0.venv\Scripts\activate.bat"
