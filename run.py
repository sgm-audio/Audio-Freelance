#!/usr/bin/env python3
"""Cross-platform dev launcher: pre-flight checks, then backend + frontend.

Works on Windows, macOS, and Linux with no dependencies beyond Python 3.9+.
Equivalent to run.sh, which remains for POSIX users.

Usage:
    python run.py            # checks + start both servers
    python run.py --check    # pre-flight checks only
    python run.py --verbose  # show subprocess output (or set VERBOSE=1)
"""

import argparse
import os
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
IS_WINDOWS = sys.platform == "win32"

BACKEND_PORT = 8080
FRONTEND_PORT = 3000
HEALTH_URL = f"http://localhost:{BACKEND_PORT}/api/v1/health"


def _ansi_supported() -> bool:
    if not sys.stdout.isatty():
        return False
    if IS_WINDOWS:
        # Windows 10+ consoles enable VT processing after this no-op.
        os.system("")
    return True


COLOR = _ansi_supported()
RED = "\033[0;31m" if COLOR else ""
GREEN = "\033[0;32m" if COLOR else ""
YELLOW = "\033[0;33m" if COLOR else ""
NC = "\033[0m" if COLOR else ""

VERBOSE = os.environ.get("VERBOSE", "0") == "1"


def log(msg: str) -> None:
    print(f"[run.py] {msg}")


def vlog(msg: str) -> None:
    if VERBOSE:
        log(msg)


def check_cmd(name: str, install_hint: str) -> int:
    if shutil.which(name) is None:
        print(f"{RED}[MISSING]{NC} {name} — install: {install_hint}")
        return 1
    vlog(f"{GREEN}[OK]{NC} {name}")
    return 0


def port_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.5)
        return sock.connect_ex(("127.0.0.1", port)) != 0


def preflight() -> int:
    failures = 0
    log("Pre-flight checks...")

    uv_hint = (
        'powershell -c "irm https://astral.sh/uv/install.ps1 | iex"'
        if IS_WINDOWS
        else "curl -LsSf https://astral.sh/uv/install.sh | sh"
    )
    failures += check_cmd("uv", uv_hint)
    failures += check_cmd("node", "https://nodejs.org")
    failures += check_cmd("npm", "bundled with Node.js")

    # optional: ollama
    if shutil.which("ollama"):
        try:
            subprocess.run(
                ["ollama", "list"],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=10,
            )
            vlog(f"{GREEN}[OK]{NC} ollama is running")
        except (subprocess.SubprocessError, OSError):
            print(f"{YELLOW}[WARN]{NC} ollama installed but not running — AI features will fail")
    else:
        print(f"{YELLOW}[WARN]{NC} ollama not found — AI features will fail")

    if (ROOT / ".env").is_file():
        vlog(f"{GREEN}[OK]{NC} .env exists")
    else:
        print(f"{RED}[MISSING]{NC} .env file not found — copy .env.example")
        failures += 1

    if (ROOT / "frontend" / "node_modules").is_dir():
        vlog(f"{GREEN}[OK]{NC} frontend/node_modules exists")
    else:
        print(f"{YELLOW}[WARN]{NC} frontend/node_modules missing — run: cd frontend && npm install")

    for port in (BACKEND_PORT, FRONTEND_PORT):
        if port_free(port):
            vlog(f"{GREEN}[OK]{NC} port {port} free")
        else:
            print(f"{RED}[BUSY]{NC} port {port} is in use — free it before running")
            failures += 1

    return failures


def spawn(cmd: list[str], cwd: Path) -> subprocess.Popen:
    out = None if VERBOSE else subprocess.DEVNULL
    # Own process group per server so shutdown kills the whole tree
    # (uv and npm both spawn the real server as a child).
    kwargs: dict = {"cwd": str(cwd), "stdout": out, "stderr": out}
    if IS_WINDOWS:
        kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP  # type: ignore[attr-defined]
    else:
        kwargs["start_new_session"] = True
    return subprocess.Popen(cmd, **kwargs)


def stop(proc: "subprocess.Popen | None") -> None:
    if proc is None or proc.poll() is not None:
        return
    if IS_WINDOWS:
        subprocess.run(
            ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
        return
    try:
        os.killpg(proc.pid, signal.SIGTERM)
    except ProcessLookupError:
        return
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        os.killpg(proc.pid, signal.SIGKILL)


def backend_healthy() -> bool:
    try:
        with urllib.request.urlopen(HEALTH_URL, timeout=2):
            return True
    except (urllib.error.URLError, OSError):
        return False


def main() -> int:
    global VERBOSE
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="run pre-flight checks only")
    parser.add_argument("--verbose", action="store_true", help="show subprocess output")
    args = parser.parse_args()
    if args.verbose:
        VERBOSE = True

    if not IS_WINDOWS:
        # Turn SIGTERM into SystemExit so the finally-block cleanup runs.
        signal.signal(signal.SIGTERM, lambda *_: sys.exit(143))

    failures = preflight()
    if failures > 0:
        print(f"\n{RED}{failures} pre-flight check(s) failed.{NC} Fix them and re-run.")
        return 1
    log("All pre-flight checks passed.")
    if args.check:
        return 0
    print()

    uv = shutil.which("uv")
    npm = shutil.which("npm")  # resolves npm.cmd on Windows
    assert uv and npm  # guaranteed by preflight

    backend = None
    frontend = None
    try:
        log(f"Starting backend (FastAPI on :{BACKEND_PORT})...")
        backend = spawn([uv, "run", "python", "main.py"], cwd=ROOT)

        for i in range(60):
            if backend_healthy():
                log(f"{GREEN}Backend ready{NC} on http://localhost:{BACKEND_PORT}")
                break
            if backend.poll() is not None:
                print(f"{RED}Backend exited early (rerun with --verbose to see why){NC}")
                return 1
            time.sleep(1)
        else:
            print(f"{RED}Backend failed to start within 60s{NC}")
            return 1

        log(f"Starting frontend (Next.js on :{FRONTEND_PORT})...")
        frontend = spawn([npm, "run", "dev"], cwd=ROOT / "frontend")

        print()
        print(f"  Dashboard:   http://localhost:{FRONTEND_PORT}")
        print(f"  API:         http://localhost:{BACKEND_PORT}")
        print(f"  Briefing:    http://localhost:{BACKEND_PORT}/briefing")
        print(f"  API Docs:    http://localhost:{BACKEND_PORT}/docs")
        print()
        print("Press Ctrl+C to stop both.")
        print()

        while True:
            for name, proc in (("Backend", backend), ("Frontend", frontend)):
                if proc.poll() is not None:
                    print(f"{RED}{name} exited unexpectedly (code {proc.returncode}){NC}")
                    return 1
            time.sleep(1)
    except KeyboardInterrupt:
        return 0
    finally:
        print()
        log("Shutting down...")
        stop(frontend)
        stop(backend)
        log("Done.")


if __name__ == "__main__":
    sys.exit(main())
