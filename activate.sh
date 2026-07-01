#!/usr/bin/env bash
# Drop into the uv-managed venv. 'exit' to leave.
cd "$(dirname "$0")" || exit 1
exec "$SHELL" -c "source .venv/bin/activate && exec $SHELL"
