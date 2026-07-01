"""Rotate cold/warm leads older than N days to archive (explicit housekeeping).

Usage:
    uv run python scripts/rotate_cold_leads.py            # 3-day default
    uv run python scripts/rotate_cold_leads.py --days 7   # override age
    uv run python scripts/rotate_cold_leads.py --dry-run  # preview only

Intended as a cron job or manual trigger every 3 days.
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from leads.store import ensure_collections_initialized, get_all_leads, rotate_cold  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Rotate cold/warm leads to archive.")
    parser.add_argument("--days", type=int, default=3, help="Age threshold in days (default: 3)")
    parser.add_argument("--dry-run", action="store_true", help="Preview what would be rotated")
    args = parser.parse_args()

    if not ensure_collections_initialized():
        print("ERROR: ChromaDB init failed. Is Ollama running?")
        sys.exit(1)

    # Preview mode
    if args.dry_run:
        from datetime import UTC, datetime, timedelta

        cutoff = datetime.now(tz=UTC) - timedelta(days=args.days)
        leads = get_all_leads()
        to_rotate = []
        for lead in leads:
            ts = lead.discovered_at
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=UTC)
            if ts < cutoff:
                to_rotate.append(lead)

        print(f"Would rotate {len(to_rotate)} leads (cutoff: {cutoff.isoformat()}):")
        for lead in to_rotate[:20]:
            print(f"  [{lead.status.value}] {lead.title[:80]} (since {lead.discovered_at.date()})")
        if len(to_rotate) > 20:
            print(f"  ... and {len(to_rotate) - 20} more")
        return

    archived, deleted = rotate_cold(age_days=args.days)
    remaining = len(get_all_leads())
    print(f"Rotated {archived} leads to archive ({deleted} deleted from active store).")
    print(f"Active leads remaining: {remaining}")


if __name__ == "__main__":
    main()
