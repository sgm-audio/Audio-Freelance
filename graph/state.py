"""Typed state for the LangGraph freelance pipeline."""

from typing import TypedDict

from leads.schema import Lead
from search.base import RawCandidate


class PipelineState(TypedDict, total=False):
    """State that flows through the LangGraph pipeline nodes."""

    # Input
    niche: str
    max_leads_per_tier: int

    # Search results (raw)
    tier1_candidates: list[RawCandidate]
    tier2_candidates: list[RawCandidate]
    tier3_candidates: list[RawCandidate]
    tier4_candidates: list[RawCandidate]
    tier5_candidates: list[RawCandidate]
    all_candidates: list[RawCandidate]

    # After dedup
    deduped_candidates: list[RawCandidate]

    # After scoring
    leads: list[Lead]
    hot_leads: list[Lead]
    warm_leads: list[Lead]
    cold_leads: list[Lead]
    skipped_leads: list[Lead]

    # Archival
    archived_count: int
    archive_path: str

    # Errors
    errors: list[str]
