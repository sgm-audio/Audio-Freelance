"""Lead data layer: schema, ChromaDB store, tracking, and raw candidate models."""

from leads.schema import PREFERRED_NICHES, Lead, LeadStatus, RawCandidate, Verdict
from leads.store import (
    archive_batch,
    check_duplicate,
    check_ollama_available,
    delete_lead,
    embed_text,
    ensure_collections_initialized,
    get_all_leads,
    get_lead_by_id,
    get_leads_by_status,
    restore_from_archive,
    rotate_cold,
    search_leads,
    update_status,
    upsert_lead,
)
from leads.tracking import (
    get_active_pursuit_lead_ids,
    get_all_tracking,
    get_tracking_history,
    log_tracking_event,
)

__all__ = [
    "Lead",
    "LeadStatus",
    "RawCandidate",
    "Verdict",
    "PREFERRED_NICHES",
    "embed_text",
    "check_duplicate",
    "upsert_lead",
    "get_leads_by_status",
    "update_status",
    "get_lead_by_id",
    "search_leads",
    "check_ollama_available",
    "ensure_collections_initialized",
    "get_all_leads",
    "delete_lead",
    "archive_batch",
    "rotate_cold",
    "restore_from_archive",
    "log_tracking_event",
    "get_tracking_history",
    "get_all_tracking",
    "get_active_pursuit_lead_ids",
]
