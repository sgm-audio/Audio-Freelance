"""Status and kill-switch for the SGM Outreach SQLite engine.

The engine in `packages/core` owns `data/outreach.sqlite`. We use the standard
library's `sqlite3` so the API has no dependency on the TypeScript workspace,
and mirror `getPipelineStatus()` / `setPaused()` from `packages/core/src/repo.ts`
so the console reports the same numbers as `sgm-outreach status`.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import UTC, datetime
from pathlib import Path

import config

# Keep in sync with LeadStateSchema in packages/core/src/schemas.ts.
LEAD_STATES = (
    "NEW",
    "ENRICHED",
    "SCORED",
    "DRAFTED",
    "PENDING_APPROVAL",
    "APPROVED",
    "SENT",
    "REPLIED",
    "NO_REPLY",
    "FOLLOWUP_1",
    "FOLLOWUP_2",
    "NURTURE",
    "HUMAN",
    "REJECTED",
    "BOUNCED",
    "UNSUBSCRIBED",
)

PASTE_STATES = ("APPROVED", "PENDING_APPROVAL")
WARMING_STATES = ("NEW", "ENRICHED", "SCORED", "DRAFTED")
STATUS_TABLES = ("companies", "contacts", "leads", "drafts", "events", "suppressions")


class OutreachDbUnavailableError(Exception):
    """The engine database is missing or cannot be read."""


def outreach_db_path() -> Path:
    """Resolve the engine DB, defaulting to <project>/data/outreach.sqlite."""
    configured = config.settings.sgm_outreach_db.strip()
    path = Path(configured).expanduser() if configured else config.ROOT / "data" / "outreach.sqlite"
    if not path.is_absolute():
        path = config.ROOT / path
    return path


def _now() -> str:
    return datetime.now(tz=UTC).isoformat()


def _empty_counts() -> dict[str, int]:
    return {state: 0 for state in LEAD_STATES}


def _snapshot(
    path: Path,
    *,
    db_exists: bool,
    source: str,
    paused: bool = False,
    counts: dict[str, int] | None = None,
    totals: dict[str, int] | None = None,
    pending: list[dict] | None = None,
    paste: list[dict] | None = None,
    warming: list[dict] | None = None,
) -> dict:
    """Build an API-shaped snapshot. No field is invented when data is absent."""
    timestamp = _now()
    return {
        "lead_counts": counts or _empty_counts(),
        # Every state is present so the funnel can show honest zeros.
        "funnel": [
            {"state": state.lower(), "count": (counts or {}).get(state, 0)}
            for state in LEAD_STATES
        ],
        "paused": paused,
        "source": source,
        "db_exists": db_exists,
        "totals": totals
        or {"companies": 0, "contacts": 0, "leads": 0, "drafts": 0, "suppressions": 0},
        "generated_at": timestamp,
        "timestamp": timestamp,
        "pending_approval": pending or [],
        "linkedin_paste_queue": paste or [],
        "linkedin_warming": warming or [],
        "db_path": str(path),
    }


def _table_counts(conn: sqlite3.Connection) -> dict[str, int]:
    return {
        "companies": conn.execute("SELECT COUNT(*) FROM companies").fetchone()[0],
        "contacts": conn.execute("SELECT COUNT(*) FROM contacts").fetchone()[0],
        "leads": conn.execute("SELECT COUNT(*) FROM leads").fetchone()[0],
        "drafts": conn.execute("SELECT COUNT(*) FROM drafts").fetchone()[0],
        "suppressions": conn.execute("SELECT COUNT(*) FROM suppressions").fetchone()[0],
    }


# Fully static query — states and the draft filter are bound parameters, so no
# SQL is constructed from variables (and S608 stays quiet without a suppression).
_QUEUE_SQL = """
SELECT l.id, l.state, l.score, l.channel, l.updated_at,
       c.name AS company_name, c.domain AS company_domain,
       ct.name AS contact_name, ct.role AS contact_role,
       ct.linkedin_url,
       d.subject, d.body
FROM leads l
LEFT JOIN companies c ON c.id = l.company_id
LEFT JOIN contacts ct ON ct.id = l.contact_id
LEFT JOIN drafts d ON d.id = (
    SELECT id FROM drafts
    WHERE lead_id = l.id
    ORDER BY created_at DESC, id DESC
    LIMIT 1
)
WHERE l.channel = 'linkedin'
  AND l.state IN (SELECT value FROM json_each(?))
  AND (? = 0 OR d.body IS NOT NULL)
ORDER BY l.updated_at DESC, l.id
"""


def _queue_rows(
    conn: sqlite3.Connection, states: tuple[str, ...], *, require_draft: bool
) -> list[dict]:
    """Project leads into the queue shapes the console renders."""
    rows = conn.execute(
        _QUEUE_SQL,
        (json.dumps(states), int(require_draft)),
    ).fetchall()
    return [
        {
            "id": row["id"],
            "contact_name": row["contact_name"],
            "company_name": row["company_name"],
            "company_domain": row["company_domain"],
            "contact_role": row["contact_role"],
            "score": row["score"],
            "channel": row["channel"],
            "updated_at": row["updated_at"],
            "state": row["state"],
            "subject": row["subject"],
            "body_preview": row["body"][:180] if row["body"] else None,
            "body": row["body"],
            "linkedin_url": row["linkedin_url"],
            "ready_to_paste": row["state"] == "APPROVED",
        }
        for row in rows
    ]


def _pending_rows(conn: sqlite3.Connection) -> list[dict]:
    """All channels awaiting a human decision, with the latest draft if any."""
    rows = conn.execute(
        """
        SELECT l.id, l.score, l.channel, l.updated_at,
               c.name AS company_name, c.domain AS company_domain,
               ct.name AS contact_name,
               d.subject, d.body
        FROM leads l
        LEFT JOIN companies c ON c.id = l.company_id
        LEFT JOIN contacts ct ON ct.id = l.contact_id
        LEFT JOIN drafts d ON d.id = (
            SELECT id FROM drafts
            WHERE lead_id = l.id
            ORDER BY created_at DESC, id DESC
            LIMIT 1
        )
        WHERE l.state = 'PENDING_APPROVAL'
        ORDER BY l.updated_at DESC, l.id
        """
    ).fetchall()
    return [
        {
            "id": row["id"],
            "contact_name": row["contact_name"],
            "company_name": row["company_name"],
            "company_domain": row["company_domain"],
            "score": row["score"],
            "channel": row["channel"],
            "updated_at": row["updated_at"],
            "subject": row["subject"],
            "body_preview": row["body"][:180] if row["body"] else None,
            "body": row["body"],
        }
        for row in rows
    ]


def load_status() -> dict:
    """Return an honest snapshot of the outreach engine, even if it is empty."""
    path = outreach_db_path()
    if not path.is_file():
        return _snapshot(path, db_exists=False, source="missing")

    try:
        conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
    except sqlite3.Error as exc:
        raise OutreachDbUnavailableError(f"Cannot open outreach database {path}: {exc}") from exc

    try:
        tables = {
            row[0]
            for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
        }
        if not {"settings", *STATUS_TABLES}.issubset(tables):
            return _snapshot(path, db_exists=True, source="sqlite-uninitialized")

        paused_row = conn.execute(
            "SELECT value FROM settings WHERE key = 'paused'"
        ).fetchone()
        paused = paused_row is not None and paused_row["value"] == "1"

        counts = _empty_counts()
        for row in conn.execute("SELECT state, COUNT(*) AS n FROM leads GROUP BY state"):
            if row["state"] in counts:
                counts[row["state"]] = row["n"]

        return _snapshot(
            path,
            db_exists=True,
            source="sqlite",
            paused=paused,
            counts=counts,
            totals=_table_counts(conn),
            pending=_pending_rows(conn),
            paste=_queue_rows(conn, PASTE_STATES, require_draft=True),
            warming=_queue_rows(conn, WARMING_STATES, require_draft=False),
        )
    finally:
        conn.close()


def set_paused(paused: bool) -> dict:
    """Write the global kill-switch flag and return the refreshed snapshot."""
    path = outreach_db_path()
    if not path.is_file():
        raise OutreachDbUnavailableError(f"Outreach database not found: {path}")

    try:
        conn = sqlite3.connect(path)
        try:
            conn.execute(
                "CREATE TABLE IF NOT EXISTS settings "
                "(key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)"
            )
            conn.execute(
                "INSERT INTO settings (key, value) VALUES ('paused', ?) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                ("1" if paused else "0",),
            )
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error as exc:
        raise OutreachDbUnavailableError(f"Cannot update outreach database {path}: {exc}") from exc

    return load_status()
