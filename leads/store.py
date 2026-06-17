"""ChromaDB-backed lead storage with Ollama embedding and dedup.

All configurable values load from .env with fallback defaults.
"""

import json
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from leads.schema import Lead, LeadStatus

# ── Config from environment (with fallback defaults) ──

CHROMA_COLLECTION_LEADS: str = os.getenv(
    "CHROMA_COLLECTION_LEADS", "freelance_leads"
)
CHROMA_COLLECTION_OUTREACH: str = os.getenv(
    "CHROMA_COLLECTION_OUTREACH", "freelance_outreach_log"
)
EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "nomic-embed-text")

_raw_threshold = os.getenv("DEDUP_SIMILARITY_THRESHOLD", "0.92")
try:
    DEDUP_SIMILARITY_THRESHOLD: float = float(_raw_threshold)
except ValueError:
    DEDUP_SIMILARITY_THRESHOLD: float = 0.92

_DATA_DIR = Path(__file__).resolve().parent / "data" / "chroma"
_DATA_DIR.mkdir(parents=True, exist_ok=True)

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
    try:
        from chromadb.utils import embedding_functions

        if check_ollama_available():
            embedding_fn = embedding_functions.OllamaEmbeddingFunction(
                model_name=EMBEDDING_MODEL,
            )
    except Exception:
        pass

    if embedding_fn is None:
        try:
            from chromadb.utils import embedding_functions

            embedding_fn = embedding_functions.SentenceTransformerEmbeddingFunction(
                model_name="all-MiniLM-L6-v2"
            )
        except Exception:
            # Absolute last resort: chromadb default (token count)
            pass

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


def check_duplicate(lead: Lead) -> Optional[str]:
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
        discovered_at=datetime.fromisoformat(metadata.get("discovered_at", datetime.now(tz=timezone.utc).isoformat())),
        last_updated=datetime.fromisoformat(metadata.get("last_updated", datetime.now(tz=timezone.utc).isoformat())),
        notes=metadata.get("notes") or None,
    )


# ── CRUD ──


def upsert_lead(lead: Lead) -> None:
    _init()
    lead.last_updated = datetime.now(tz=timezone.utc)
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


def get_lead_by_id(lead_id: str | uuid.UUID) -> Optional[Lead]:
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
    _init()
    lead_id = str(lead_id)
    _leads_collection.update(
        ids=[lead_id],
        metadatas=[
            {
                "status": new_status.value,
                "last_updated": datetime.now(tz=timezone.utc).isoformat(),
            }
        ],
    )


def delete_lead(lead_id: uuid.UUID | str) -> None:
    _init()
    _leads_collection.delete(ids=[str(lead_id)])


# ── Outreach logging ──


def log_outreach(
    lead_id: str,
    template_used: str,
    draft_text: str,
    status: str = "DRAFTED",
) -> None:
    _init()
    _outreach_collection.add(
        ids=[f"{lead_id}_{datetime.now(tz=timezone.utc).isoformat()}"],
        documents=[draft_text],
        metadatas=[
            {
                "lead_id": lead_id,
                "template_used": template_used,
                "status": status,
                "created_at": datetime.now(tz=timezone.utc).isoformat(),
            }
        ],
    )
