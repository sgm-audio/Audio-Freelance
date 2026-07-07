"""Ponytail tracking: JSONL-per-lead event log for status transitions, outreach.

Each lead gets a `leads/data/tracking/<lead_id>.jsonl` file with one JSON
object per line.  No new deps, stdlib-only.
"""

import json
import os
from datetime import UTC, datetime
from pathlib import Path

TRACKING_DIR = Path(
    os.getenv(
        "LEADS_TRACKING_DIR",
        str(Path(__file__).resolve().parent / "data" / "tracking"),
    )
)

# ── internal helpers ──


def _tracking_path(lead_id: str) -> Path:
    return TRACKING_DIR / f"{lead_id}.jsonl"


def _ensure_dir() -> None:
    TRACKING_DIR.mkdir(parents=True, exist_ok=True)


# ── public API ──


def log_tracking_event(
    lead_id: str,
    event_type: str,
    data: dict,
) -> None:
    """Append an event line to the lead's tracking log."""
    _ensure_dir()
    entry = {
        "at": datetime.now(tz=UTC).isoformat(),
        "type": event_type,
        "data": data,
    }
    with open(_tracking_path(lead_id), "a") as f:
        f.write(json.dumps(entry) + "\n")


def get_tracking_history(lead_id: str) -> list[dict]:
    """Return all tracking events for a lead, oldest first."""
    path = _tracking_path(lead_id)
    if not path.exists():
        return []
    events: list[dict] = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line:
                events.append(json.loads(line))
    return events


def get_all_tracking(limit: int = 200) -> list[dict]:
    """Return the most recent tracking events across all leads."""
    _ensure_dir()
    all_events: list[dict] = []
    for p in sorted(
        TRACKING_DIR.glob("*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True
    ):
        lead_id = p.stem
        for line in open(p):
            line = line.strip()
            if not line:
                continue
            entry = json.loads(line)
            entry["lead_id"] = lead_id
            all_events.append(entry)
            if len(all_events) >= limit:
                break
        if len(all_events) >= limit:
            break
    # Sort newest first
    all_events.sort(key=lambda e: e.get("at", ""), reverse=True)
    return all_events[:limit]


def get_active_pursuit_lead_ids() -> list[str]:
    """Return lead IDs currently in active pursuit (latest event has active status)."""
    ACTIVE_STATUSES = {"CONTACTED", "REPLIED", "PROPOSAL_SENT"}
    _ensure_dir()
    active: list[str] = []
    for p in TRACKING_DIR.glob("*.jsonl"):
        lead_id = p.stem
        events = get_tracking_history(lead_id)
        if not events:
            continue
        # Check the last status_change event
        for evt in reversed(events):
            if evt.get("type") == "status_change":
                to_status = evt.get("data", {}).get("to_status", "")
                if to_status in ACTIVE_STATUSES:
                    active.append(lead_id)
                break
    return active
