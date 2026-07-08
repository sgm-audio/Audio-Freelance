#!/usr/bin/env bash
# Automated backup of ChromaDB, archives, tracking, and profile data.
# Usage: ./scripts/backup.sh [--retain N] [--verify]
#   --retain N   Keep only N most recent backups (default: 7)
#   --verify     Run integrity check after backup
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$ROOT/leads/data/backups}"
RETENTION=7
VERIFY=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --retain) RETENTION="$2"; shift 2 ;;
    --verify) VERIFY=1; shift ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
done

TIMESTAMP=$(date -u +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/backup_$TIMESTAMP.tar.gz"

mkdir -p "$BACKUP_DIR"

echo "=== Backup $(date) ==="

# 1. Backup ChromaDB data
echo "Backing up ChromaDB..."
CHROMA_DIR="$ROOT/leads/data/chroma"
CHROMA_SIZE="N/A"
if [ -d "$CHROMA_DIR" ]; then
  CHROMA_SIZE=$(du -sh "$CHROMA_DIR" 2>/dev/null | cut -f1 || echo "N/A")
fi
echo "   ChromaDB: $CHROMA_SIZE"

# 2. Backup archives
ARCHIVE_DIR="$ROOT/leads/data/archive"
ARCHIVE_COUNT=0
if [ -d "$ARCHIVE_DIR" ]; then
  ARCHIVE_COUNT=$(find "$ARCHIVE_DIR" -name "*.jsonl" | wc -l)
fi
echo "   Archives: $ARCHIVE_COUNT files"

# 3. Backup tracking data
TRACKING_DIR="$ROOT/leads/data/tracking"
TRACKING_COUNT=0
if [ -d "$TRACKING_DIR" ]; then
  TRACKING_COUNT=$(find "$TRACKING_DIR" -name "*.jsonl" | wc -l)
fi
echo "   Tracking: $TRACKING_COUNT files"

# 4. Backup profile
PROFILE="$ROOT/profile.yaml"
PROFILE_EXISTS=0
[ -f "$PROFILE" ] && PROFILE_EXISTS=1
echo "   Profile: $([ $PROFILE_EXISTS -eq 1 ] && echo 'present' || echo 'missing')"

# 5. Create archive
echo ""
echo "Creating backup archive: $BACKUP_FILE"
tar -czf "$BACKUP_FILE" \
  -C "$ROOT/leads/data" chroma archive tracking \
  ${PROFILE_EXISTS:+-C "$ROOT" profile.yaml} 2>/dev/null

BACKUP_SIZE=$(du -sh "$BACKUP_FILE" 2>/dev/null | cut -f1 || echo "N/A")
echo "   Size: $BACKUP_SIZE"

# 6. Verify if requested
if [ $VERIFY -eq 1 ]; then
  echo "Verifying backup integrity..."
  VERIFY_DIR=$(mktemp -d)
  tar -xzf "$BACKUP_FILE" -C "$VERIFY_DIR" 2>/dev/null
  if [ -d "$VERIFY_DIR/chroma" ]; then
    echo "   ChromaDB: OK"
  else
    echo "   ChromaDB: MISSING"
  fi
  if [ -d "$VERIFY_DIR/archive" ]; then
    echo "   Archives: OK ($(find "$VERIFY_DIR/archive" -name "*.jsonl" | wc -l) files)"
  fi
  rm -rf "$VERIFY_DIR"
fi

# 7. Retention: prune old backups
if [ $RETENTION -gt 0 ]; then
  BACKUP_COUNT=$(find "$BACKUP_DIR" -name "backup_*.tar.gz" | wc -l)
  if [ "$BACKUP_COUNT" -gt "$RETENTION" ]; then
    echo ""
    echo "Pruning old backups (retaining $RETENTION of $BACKUP_COUNT)..."
    find "$BACKUP_DIR" -name "backup_*.tar.gz" | sort | head -n -"$RETENTION" | while read -r old; do
      echo "   Removing: $(basename "$old")"
      rm "$old"
    done
  fi
fi

echo ""
echo "=== Backup complete: $BACKUP_FILE ==="
echo "   Retaining $RETENTION backups."
