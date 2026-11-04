#!/usr/bin/env bash
set -euo pipefail

# Audio-Freelance — one-click launcher (macOS / Linux).
# ./start.sh — backend + frontend start, browser opens automatically.
# No venv activation; uv and Node.js are bootstrapped if missing.

cd "$(dirname "$0")"

unset VIRTUAL_ENV

command -v uv >/dev/null 2>&1 || {
  echo "uv not found — install it: https://astral.sh/uv/install.sh"
  exit 1
}
command -v node >/dev/null 2>&1 || {
  echo "Node.js not found — install it: https://nodejs.org"
  exit 1
}

exec uv run python run.py "$@"
