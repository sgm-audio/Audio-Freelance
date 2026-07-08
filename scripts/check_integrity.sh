#!/usr/bin/env bash
# Data integrity check: validates ChromaDB, archives, tracking.
# Usage: ./scripts/check_integrity.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ERRORS=0

echo "=== Integrity Check $(date) ==="
echo ""

# 1. Check ChromaDB
echo "1. ChromaDB..."
CHROMA_DIR="$ROOT/leads/data/chroma"
if [ ! -d "$CHROMA_DIR" ]; then
  echo "   MISSING: $CHROMA_DIR"
  ERRORS=$((ERRORS + 1))
else
  SQLITE_FILE=$(find "$CHROMA_DIR" -name "chroma.sqlite3" -print -quit 2>/dev/null || echo "")
  if [ -z "$SQLITE_FILE" ]; then
    echo "   No chroma.sqlite3 found"
    ERRORS=$((ERRORS + 1))
  else
    DB_SIZE=$(du -sh "$SQLITE_FILE" 2>/dev/null | cut -f1 || echo "N/A")
    echo "   Found: $SQLITE_FILE ($DB_SIZE)"
    # Check SQLite integrity
    if command -v sqlite3 >/dev/null 2>&1; then
      INTEGRITY=$(sqlite3 "$SQLITE_FILE" "PRAGMA integrity_check;" 2>/dev/null || echo "FAILED")
      echo "   Integrity: $INTEGRITY"
      [ "$INTEGRITY" != "ok" ] && ERRORS=$((ERRORS + 1))
    fi
  fi
fi

# 2. Check archives
echo ""
echo "2. Archives..."
ARCHIVE_DIR="$ROOT/leads/data/archive"
if [ ! -d "$ARCHIVE_DIR" ]; then
  echo "   Missing (OK — may not have been created yet)"
else
  ARCHIVE_FILES=$(find "$ARCHIVE_DIR" -name "cold_*.jsonl" 2>/dev/null | wc -l)
  CORRUPT=0
  for f in "$ARCHIVE_DIR"/cold_*.jsonl; do
    [ -f "$f" ] || continue
    if ! python3 -c "import json; [json.loads(l) for l in open('$f') if l.strip()]" 2>/dev/null; then
      echo "   CORRUPT: $(basename "$f")"
      CORRUPT=$((CORRUPT + 1))
    fi
  done
  echo "   Files: $ARCHIVE_FILES ($([ $CORRUPT -gt 0 ] && echo "$CORRUPT corrupt" || echo "all valid"))"
  [ $CORRUPT -gt 0 ] && ERRORS=$((ERRORS + 1))
fi

# 3. Check tracking
echo ""
echo "3. Tracking..."
TRACKING_DIR="$ROOT/leads/data/tracking"
if [ ! -d "$TRACKING_DIR" ]; then
  echo "   Missing (OK — may not have been created yet)"
else
  TRACKING_FILES=$(find "$TRACKING_DIR" -name "*.jsonl" 2>/dev/null | wc -l)
  CORRUPT=0
  for f in "$TRACKING_DIR"/*.jsonl; do
    [ -f "$f" ] || continue
    if ! python3 -c "import json; [json.loads(l) for l in open('$f') if l.strip()]" 2>/dev/null; then
      echo "   CORRUPT: $(basename "$f")"
      CORRUPT=$((CORRUPT + 1))
    fi
  done
  echo "   Files: $TRACKING_FILES ($([ $CORRUPT -gt 0 ] && echo "$CORRUPT corrupt" || echo "all valid"))"
  [ $CORRUPT -gt 0 ] && ERRORS=$((ERRORS + 1))
fi

# 4. Check profile
echo ""
echo "4. Profile..."
PROFILE="$ROOT/profile.yaml"
if [ ! -f "$PROFILE" ]; then
  echo "   Missing (will be created on first setup)"
else
  if python3 -c "import yaml; yaml.safe_load(open('$PROFILE'))" 2>/dev/null; then
    echo "   Valid YAML"
  else
    echo "   CORRUPT: invalid YAML"
    ERRORS=$((ERRORS + 1))
  fi
fi

echo ""
if [ $ERRORS -eq 0 ]; then
  echo "=== All checks passed ==="
else
  echo "=== $ERRORS error(s) found ==="
fi

exit $ERRORS
