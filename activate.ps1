# Drop into the uv-managed venv (Windows PowerShell). 'exit' to leave.
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$activate = Join-Path $root ".venv\Scripts\Activate.ps1"
if (-not (Test-Path $activate)) {
    Write-Host "No .venv found — run 'uv sync' first." -ForegroundColor Red
    exit 1
}
powershell -NoExit -ExecutionPolicy Bypass -Command "& '$activate'"
