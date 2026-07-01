"""ChromaDB-backed lead storage with Ollama embedding and dedup.

All configurable values load from .env with fallback defaults.
"""

import contextlib
import json
import os
import re
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

from dotenv import load_dotenv

from leads.schema import Lead, LeadStatus

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

# ── Config from environment (with fallback defaults) ──

CHROMA_COLLECTION_LEADS: str = os.getenv("CHROMA_COLLECTION_LEADS", "freelance_leads")
CHROMA_COLLECTION_OUTREACH: str = os.getenv("CHROMA_COLLECTION_OUTREACH", "freelance_outreach_log")
EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "nomic-embed-text")

_raw_threshold = os.getenv("DEDUP_SIMILARITY_THRESHOLD", "0.92")
try:
    DEDUP_SIMILARITY_THRESHOLD: float = float(_raw_threshold)
except ValueError:
    DEDUP_SIMILARITY_THRESHOLD = 0.92

_DATA_DIR = Path(
    os.getenv(
        "LEADS_DATA_DIR",
        str(Path(__file__).resolve().parent / "data" / "chroma"),
    )
)
_DATA_DIR.mkdir(parents=True, exist_ok=True)

ARCHIVE_DIR = Path(
    os.getenv(
        "LEADS_ARCHIVE_DIR",
        str(Path(__file__).resolve().parent / "data" / "archive"),
    )
)
ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)

# ponytail: source blacklist prevents test pollution in production
_SOURCE_BLACKLIST: set[str] = {"test"}
# Allow explicit override for test runners
_allow_test_source: bool = bool(os.getenv("LEADS_ALLOW_TEST_LEADS"))

_leads_collection = None
_outreach_collection = None
_initialized = False


def check_ollama_available() -> bool:
    """Return True if the Ollama server is reachable with the embedding model."""
    try:
        import ollama

        ollama.list()
        return True
    except Exception:
        return False


def ensure_collections_initialized() -> bool:
    """Force re-init; returns True if successful."""
    global _initialized
    _initialized = False
    try:
        _init()
        return True
    except Exception:
        return False


def _init() -> None:
    global _leads_collection, _outreach_collection, _initialized
    if _initialized:
        return

    import chromadb

    # Try Ollama first, fall back to local sentence-transformers
    embedding_fn = None
    with contextlib.suppress(Exception):
        from chromadb.utils import embedding_functions

        if check_ollama_available():
            embedding_fn = embedding_functions.OllamaEmbeddingFunction(
                model_name=EMBEDDING_MODEL,
            )

    if embedding_fn is None:
        with contextlib.suppress(Exception):
            from chromadb.utils import embedding_functions

            embedding_fn = embedding_functions.SentenceTransformerEmbeddingFunction(
                model_name="all-MiniLM-L6-v2"
            )

    client = chromadb.PersistentClient(
        path=str(_DATA_DIR),
    )

    _leads_collection = client.get_or_create_collection(
        name=CHROMA_COLLECTION_LEADS,
        embedding_function=embedding_fn,
        metadata={"hnsw:space": "cosine"},
    )

    _outreach_collection = client.get_or_create_collection(
        name=CHROMA_COLLECTION_OUTREACH,
        embedding_function=embedding_fn,
        metadata={"hnsw:space": "cosine"},
    )

    _initialized = True


def embed_text(lead: Lead) -> str:
    """Produce normalized text for embedding.

    Concatenates title + raw_text[:500], then normalizes:
    lowercase, strip whitespace, collapse newlines/spaces.
    """
    raw = lead.raw_text[:500]
    text = f"{lead.title} — {raw}"
    text = text.lower().strip()
    text = re.sub(r"\s+", " ", text)
    return text


def check_duplicate(lead: Lead) -> str | None:
    """Query nearest neighbor; return existing lead id if cosine similarity >= threshold."""
    _init()
    text = embed_text(lead)

    results = _leads_collection.query(
        query_texts=[text],
        n_results=1,
        include=["distances"],
    )

    if results["ids"] and results["ids"][0]:
        distance = results["distances"][0][0]
        similarity = 1.0 - distance
        if similarity >= DEDUP_SIMILARITY_THRESHOLD:
            return results["ids"][0][0]

    return None


# ── helpers ──


def _lead_to_metadata(lead: Lead) -> dict:
    return {
        "id": str(lead.id),
        "source": lead.source,
        "tier": int(lead.tier),
        "title": lead.title,
        "company": lead.company or "",
        "url": lead.url,
        "raw_text": lead.raw_text,
        "niche": lead.niche,
        "signals": json.dumps(lead.signals),
        "score": int(lead.score),
        "verdict": lead.verdict,
        "status": lead.status.value,
        "contact_path": lead.contact_path or "",
        "discovered_at": lead.discovered_at.isoformat(),
        "last_updated": lead.last_updated.isoformat(),
        "notes": lead.notes or "",
    }


def _metadata_to_lead(metadata: dict) -> Lead:
    """Convert ChromaDB metadata dict back to Lead.

    Uses .get() for all optional fields to prevent KeyError on sparse metadata.
    """
    return Lead(
        id=uuid.UUID(metadata["id"]),
        source=metadata.get("source", "unknown"),
        tier=int(metadata.get("tier", 1)),
        title=metadata.get("title", ""),
        company=metadata.get("company") or None,
        url=metadata.get("url", ""),
        raw_text=metadata.get("raw_text", ""),
        niche=metadata.get("niche", "plugin_contract"),
        signals=json.loads(metadata.get("signals", "{}")),
        score=int(metadata.get("score", 0)),
        verdict=metadata.get("verdict", "COLD"),
        status=LeadStatus(metadata.get("status", "NEW")),
        contact_path=metadata.get("contact_path") or None,
        discovered_at=datetime.fromisoformat(
            metadata.get("discovered_at", datetime.now(tz=UTC).isoformat())
        ),
        last_updated=datetime.fromisoformat(
            metadata.get("last_updated", datetime.now(tz=UTC).isoformat())
        ),
        notes=metadata.get("notes") or None,
    )


# ── CRUD ──


def upsert_lead(lead: Lead) -> None:
    """Persist a lead to ChromaDB.

    Blocks blacklisted sources (e.g. 'test') unless LEADS_ALLOW_TEST_LEADS
    is set, so test suites cannot accidentally pollute the production store.
    """
    _init()

    # ── Source blacklist guard ──
    if lead.source in _SOURCE_BLACKLIST and not _allow_test_source:
        raise ValueError(
            f"source '{lead.source}' is blocked in production. "
            "Set LEADS_ALLOW_TEST_LEADS=1 to bypass (for test suites only)."
        )

    lead.last_updated = datetime.now(tz=UTC)
    text = embed_text(lead)
    metadata = _lead_to_metadata(lead)

    _leads_collection.upsert(
        ids=[str(lead.id)],
        documents=[text],
        metadatas=[metadata],
    )


def get_leads_by_status(status: LeadStatus) -> list[Lead]:
    _init()
    results = _leads_collection.get(
        where={"status": status.value},
        include=["metadatas"],
    )

    if not results["metadatas"]:
        return []

    return [_metadata_to_lead(m) for m in results["metadatas"]]


def get_all_leads() -> list[Lead]:
    _init()
    results = _leads_collection.get(include=["metadatas"])
    if not results["metadatas"]:
        return []
    return [_metadata_to_lead(m) for m in results["metadatas"]]


def get_lead_by_id(lead_id: str | uuid.UUID) -> Lead | None:
    _init()
    lead_id = str(lead_id)
    results = _leads_collection.get(
        ids=[lead_id],
        include=["metadatas"],
    )
    if results["metadatas"]:
        return _metadata_to_lead(results["metadatas"][0])
    return None


def search_leads(query_text: str, n_results: int = 10) -> list[Lead]:
    """Semantic search across all leads."""
    _init()
    results = _leads_collection.query(
        query_texts=[query_text],
        n_results=n_results,
        include=["metadatas", "distances"],
    )
    if not results["metadatas"] or not results["metadatas"][0]:
        return []
    return [_metadata_to_lead(m) for m in results["metadatas"][0]]


def update_status(lead_id: uuid.UUID | str, new_status: LeadStatus) -> None:
    """Transition a lead to a new status, archiving the prior state via tracking.

    When moving to LeadStatus.DEAD, the lead is also deleted from the active
    ChromaDB and its full record is archived for audit/future analysis.
    """
    _init()
    lead_id_str = str(lead_id)

    # Log the transition as a tracking event
    old_lead = get_lead_by_id(lead_id_str)
    if old_lead is not None:
        from leads.tracking import log_tracking_event  # ponytail: local import avoids circular

        log_tracking_event(
            lead_id_str,
            "status_change",
            {
                "from_status": old_lead.status.value,
                "to_status": new_status.value,
                "from_verdict": old_lead.verdict,
            },
        )

        # If moving to DEAD, archive full record and delete from active store
        if new_status == LeadStatus.DEAD:
            _archive_lead_record(old_lead, tag="dead")
            _leads_collection.delete(ids=[lead_id_str])
            return

    # Update Chroma
    _leads_collection.update(
        ids=[lead_id_str],
        metadatas=[
            {
                "status": new_status.value,
                "last_updated": datetime.now(tz=UTC).isoformat(),
            }
        ],
    )


def delete_lead(lead_id: uuid.UUID | str) -> None:
    _init()
    _leads_collection.delete(ids=[str(lead_id)])


# ── Archive (cold leads, dead leads, historical audit) ──


def archive_batch(leads: list, tag: str = "cold") -> Path:
    """Write a batch of leads to archive/<tag>_<UTC>.jsonl.

    Returns the archive file path for audit/logging.
    """
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(tz=UTC).strftime("%Y-%m-%dT%H%M%S")
    path = ARCHIVE_DIR / f"{tag}_{ts}.jsonl"
    with open(path, "a") as f:
        for lead in leads:
            f.write(lead.model_dump_json() + "\n")
    return path


def _archive_lead_record(lead: Lead, tag: str = "dead") -> Path:
    """Archive a single lead record (used for DEAD transitions)."""
    return archive_batch([lead], tag=tag)


def rotate_cold(age_days: int = 3) -> tuple[int, int]:
    """Move COLD/WARM leads older than *age_days* to archive, delete from Chroma.

    Only rotates leads with status in {COLD, WARM} to keep HOT/NEW/
    CONTACTED leads active.  Returns (archived_count, deleted_count).
    """
    _init()
    cutoff = datetime.now(tz=UTC) - timedelta(days=age_days)

    all_leads = get_all_leads()
    to_archive: list[Lead] = []

    for lead in all_leads:
        # Only rotate cold/warm leads that are old enough
        if lead.status not in (LeadStatus.COLD, LeadStatus.WARM):
            continue
        # discovered_at may be naive — make it aware for comparison
        ts = lead.discovered_at
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=UTC)
        if ts < cutoff:
            to_archive.append(lead)

    archived = 0
    deleted = 0
    if to_archive:
        archive_batch(to_archive, tag="cold")
        archived = len(to_archive)
        for lead in to_archive:
            try:
                _leads_collection.delete(ids=[str(lead.id)])
                deleted += 1
            except Exception:
                pass

    return archived, deleted


def restore_from_archive(archive_path: Path) -> int:
    """Re-ingest leads from an archive JSONL file.

    Each lead is upserted individually; duplicates are skipped.
    Returns the number of leads restored.
    """
    _init()
    restored = 0
    with open(archive_path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                data = json.loads(line)
                lead = Lead(**data)
                upsert_lead(lead)
                restored += 1
            except ValueError:
                # Duplicate or blocked source — skip
                pass
    return restored


# ── Outreach logging ──


def log_outreach(
    lead_id: str,
    template_used: str,
    draft_text: str,
    status: str = "DRAFTED",
) -> None:
    _init()
    _outreach_collection.add(
        ids=[f"{lead_id}_{datetime.now(tz=UTC).isoformat()}"],
        documents=[draft_text],
        metadatas=[
            {
                "lead_id": lead_id,
                "template_used": template_used,
                "status": status,
                "created_at": datetime.now(tz=UTC).isoformat(),
            }
        ],
    )


# ── Rotation tracking (laptop-friendly: on-startup, not cron) ──

_ROTATION_STAMP_FILE = _DATA_DIR.parent / ".last_rotation"


def get_last_rotation() -> datetime | None:
    """Return the timestamp of the last rotation, or None if never."""
    if not _ROTATION_STAMP_FILE.exists():
        return None
    try:
        return datetime.fromisoformat(_ROTATION_STAMP_FILE.read_text().strip())
    except Exception:
        return None


def _touch_rotation() -> None:
    """Record that a rotation just happened."""
    _ROTATION_STAMP_FILE.write_text(datetime.now(tz=UTC).isoformat())


def auto_rotate_if_needed(age_days: int = 3) -> tuple[int, int] | None:
    """Check if rotation is overdue, and run it if so.

    Called once on application startup.  No cron needed — every time you
    start the app after ≥age_days away from the keyboard, cold leads are
    rotated automatically.

    Returns (archived, deleted) if rotation ran, or None if not needed.
    """
    last = get_last_rotation()
    now = datetime.now(tz=UTC)

    if last is None:
        # First run — record timestamp, don't rotate
        _touch_rotation()
        return None

    if (now - last) < timedelta(days=age_days):
        return None

    archived, deleted = rotate_cold(age_days=age_days)
    _touch_rotation()
    return archived, deleted
