#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND_PID=""
FRONTEND_PID=""

# ── verbose helpers ──
log()  { echo "[run.sh] $*"; }
vlog() { [ "${VERBOSE:-0}" = "1" ] && echo "[run.sh] $*" || true; }
quiet() { if [ "${VERBOSE:-0}" = "1" ]; then "$@"; else "$@" >/dev/null 2>&1; fi; }

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

cleanup() {
  echo ""
  log "Shutting down..."
  [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null || true
  [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null || true
  wait 2>/dev/null || true
  log "Done."
}
trap cleanup EXIT INT TERM

# ── pre-flight checks ──
failures=0

check_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo -e "${RED}[MISSING]${NC} $1 — install: $2"
    failures=$((failures + 1))
  else
    vlog "${GREEN}[OK]${NC} $1"
  fi
}

log "Pre-flight checks..."

check_cmd uv     "curl -LsSf https://astral.sh/uv/install.sh | sh"
check_cmd node   "https://nodejs.org"
check_cmd npm    "bundled with Node.js"

# optional: ollama
if command -v ollama >/dev/null 2>&1; then
  if ollama list >/dev/null 2>&1; then
    vlog "${GREEN}[OK]${NC} ollama is running"
  else
    echo -e "${YELLOW}[WARN]${NC} ollama installed but not running — AI features will fail"
  fi
else
  echo -e "${YELLOW}[WARN]${NC} ollama not found — AI features will fail"
fi

# .env (optional for boot — API keys only)
if [ -f "$ROOT/.env" ]; then
  vlog "${GREEN}[OK]${NC} .env exists"
else
  echo -e "${YELLOW}[WARN]${NC} .env missing — copy .env.example for API keys; frontend will still start"
fi

# frontend Next.js binary (hard requirement)
if [ -f "$ROOT/frontend/node_modules/next/dist/bin/next" ]; then
  vlog "${GREEN}[OK]${NC} frontend Next.js binary present"
else
  echo -e "${RED}[MISSING]${NC} frontend deps — run: cd frontend && npm install"
  failures=$((failures + 1))
fi

# port conflict detection
check_port() {
  local port="$1"
  if ss -tlnp 2>/dev/null | grep -q ":$port "; then
    echo -e "${RED}[BUSY]${NC} port $port is in use — free it before running"
    failures=$((failures + 1))
  else
    vlog "${GREEN}[OK]${NC} port $port free"
  fi
}
check_port 8080
check_port 3000

if [ "$failures" -gt 0 ]; then
  echo -e "\n${RED}$failures pre-flight check(s) failed.${NC} Fix them and re-run."
  exit 1
fi

log "All pre-flight checks passed."
echo ""

# ── Backend ──
log "Starting backend (FastAPI on :8080)..."
cd "$ROOT"
quiet uv run python main.py &
BACKEND_PID=$!

for i in $(seq 1 60); do
  if curl -s http://localhost:8080/api/v1/health >/dev/null 2>&1; then
    log "${GREEN}Backend ready${NC} on http://localhost:8080"
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo -e "${RED}Backend failed to start within 60s${NC}"
    exit 1
  fi
  sleep 1
done

# ── Frontend ──
log "Starting frontend (Next.js on :3000)..."
cd "$ROOT/frontend"
quiet npm run dev &
FRONTEND_PID=$!

echo ""
echo "  Dashboard:   http://localhost:3000"
echo "  API:         http://localhost:8080"
echo "  Briefing:    http://localhost:8080/briefing"
echo "  API Docs:    http://localhost:8080/docs"
echo ""
echo "Press Ctrl+C to stop both."
echo ""

wait
