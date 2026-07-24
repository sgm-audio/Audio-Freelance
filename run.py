#!/usr/bin/env python3
"""Cross-platform dev launcher: pre-flight checks, then backend + frontend.

Works on Windows, macOS, and Linux with no dependencies beyond Python 3.9+.
Equivalent to run.sh, which remains for POSIX users.

Usage:
    python run.py            # checks + start both servers
    python run.py --check    # pre-flight checks only
    python run.py --verbose  # show subprocess output (or set VERBOSE=1)
"""

from __future__ import annotations

import argparse
import contextlib
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
HEALTH_URL = f"http://127.0.0.1:{BACKEND_PORT}/api/v1/health"
LOG_DIR = ROOT / "data"
BACKEND_LOG = LOG_DIR / "run-backend.log"
FRONTEND_LOG = LOG_DIR / "run-frontend.log"


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
    print(f"[run.py] {msg}", flush=True)


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


def port_listening(port: int) -> bool:
    return not port_free(port)


def resolve_node() -> str | None:
    """Return a runnable node binary (prefer .exe over Windows .CMD shims)."""
    node = shutil.which("node")
    if not node:
        return None
    if IS_WINDOWS and node.lower().endswith((".cmd", ".bat")):
        pf = Path(r"C:\Program Files\nodejs\node.exe")
        if pf.is_file():
            return str(pf)
        # Last resort: let cmd.exe expand the shim.
        return node
    return node


def frontend_cmd() -> list[str]:
    """Prefer `node next/dist/bin/next` so Windows npm.CMD shims cannot exit early."""
    next_bin = ROOT / "frontend" / "node_modules" / "next" / "dist" / "bin" / "next"
    node = resolve_node()
    if node and next_bin.is_file():
        return [node, str(next_bin), "dev", "--port", str(FRONTEND_PORT)]
    npm = shutil.which("npm")
    assert npm
    return [npm, "run", "dev", "--", "--port", str(FRONTEND_PORT)]


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

    # Backend secrets are optional for boot; warn only so the dashboard can still start.
    if (ROOT / ".env").is_file():
        vlog(f"{GREEN}[OK]{NC} .env exists")
    else:
        print(
            f"{YELLOW}[WARN]{NC} .env missing — copy .env.example for API keys; "
            "frontend will still start"
        )

    next_bin = ROOT / "frontend" / "node_modules" / "next" / "dist" / "bin" / "next"
    if next_bin.is_file():
        vlog(f"{GREEN}[OK]{NC} frontend Next.js binary present")
    else:
        print(
            f"{RED}[MISSING]{NC} frontend deps — run: cd frontend && npm install"
        )
        failures += 1

    for port in (BACKEND_PORT, FRONTEND_PORT):
        if port_free(port):
            vlog(f"{GREEN}[OK]{NC} port {port} free")
        else:
            print(f"{RED}[BUSY]{NC} port {port} is in use — free it before running")
            failures += 1

    return failures


def spawn(cmd: list[str], cwd: Path, log_path: Path) -> tuple[subprocess.Popen, object | None]:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    log_file = None
    if VERBOSE:
        out: int | object = None  # inherit
    else:
        log_file = open(log_path, "w", encoding="utf-8", errors="replace")
        out = log_file
    kwargs: dict = {"cwd": str(cwd), "stdout": out, "stderr": subprocess.STDOUT}
    if IS_WINDOWS:
        kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP  # type: ignore[attr-defined]
    else:
        kwargs["start_new_session"] = True
    return subprocess.Popen(cmd, **kwargs), log_file


def stop(proc: subprocess.Popen | None) -> None:
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


def dump_log(path: Path, label: str) -> None:
    if not path.is_file():
        return
    try:
        text = path.read_text(encoding="utf-8", errors="replace").strip()
    except OSError:
        return
    if not text:
        return
    print(f"\n--- last lines of {label} ({path}) ---")
    lines = text.splitlines()
    print("\n".join(lines[-40:]))
    print("---\n")


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
    assert uv  # guaranteed by preflight

    backend = None
    frontend = None
    backend_log_fh = None
    frontend_log_fh = None
    try:
        log(f"Starting backend (FastAPI on :{BACKEND_PORT})...")
        backend, backend_log_fh = spawn(
            [uv, "run", "python", "main.py"], cwd=ROOT, log_path=BACKEND_LOG
        )

        for _ in range(60):
            if backend_healthy():
                log(f"{GREEN}Backend ready{NC} on http://localhost:{BACKEND_PORT}")
                break
            if backend.poll() is not None:
                print(f"{RED}Backend exited early{NC}")
                dump_log(BACKEND_LOG, "backend")
                print("Rerun with --verbose to stream logs live.")
                return 1
            time.sleep(1)
        else:
            print(f"{RED}Backend failed to start within 60s{NC}")
            dump_log(BACKEND_LOG, "backend")
            return 1

        log(f"Starting frontend (Next.js on :{FRONTEND_PORT})...")
        frontend, frontend_log_fh = spawn(
            frontend_cmd(), cwd=ROOT / "frontend", log_path=FRONTEND_LOG
        )

        for _ in range(60):
            if frontend.poll() is not None:
                print(f"{RED}Frontend exited early (code {frontend.returncode}){NC}")
                dump_log(FRONTEND_LOG, "frontend")
                print("Rerun with --verbose, or: cd frontend && npm run dev")
                return 1
            if port_listening(FRONTEND_PORT):
                log(f"{GREEN}Frontend ready{NC} on http://localhost:{FRONTEND_PORT}")
                break
            time.sleep(1)
        else:
            print(f"{RED}Frontend failed to listen on :{FRONTEND_PORT} within 60s{NC}")
            dump_log(FRONTEND_LOG, "frontend")
            return 1

        print()
        print(f"  Dashboard:   http://localhost:{FRONTEND_PORT}")
        print(f"  API:         http://localhost:{BACKEND_PORT}")
        print(f"  Briefing:    http://localhost:{BACKEND_PORT}/briefing")
        print(f"  API Docs:    http://localhost:{BACKEND_PORT}/docs")
        print()
        print("Press Ctrl+C to stop both.")
        print()

        while True:
            for name, proc, log_path in (
                ("Backend", backend, BACKEND_LOG),
                ("Frontend", frontend, FRONTEND_LOG),
            ):
                if proc.poll() is not None:
                    print(
                        f"{RED}{name} exited unexpectedly (code {proc.returncode}){NC}"
                    )
                    dump_log(log_path, name.lower())
                    return 1
            time.sleep(1)
    except KeyboardInterrupt:
        return 0
    finally:
        print()
        log("Shutting down...")
        stop(frontend)
        stop(backend)
        for fh in (frontend_log_fh, backend_log_fh):
            if fh is not None:
                with contextlib.suppress(OSError):
                    fh.close()
        log("Done.")


if __name__ == "__main__":
    sys.exit(main())
