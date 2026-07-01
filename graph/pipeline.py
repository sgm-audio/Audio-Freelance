"""Pipeline: search → dedup → deep-fetch → score → route.

Uses direct async orchestration instead of LangGraph for reliability.
LangGraph wrapper provided for future graph-based extensions.
"""

import asyncio
import contextlib
from typing import Any

from langgraph.graph import END, START, StateGraph

from graph.state import PipelineState
from leads.schema import Lead
from leads.store import archive_batch, check_duplicate, upsert_lead
from scoring.profile import load_profile
from scoring.profile_score import score_against_profile
from search import run_tier1, run_tier2, run_tier3, run_tier4, run_tier5
from search.base import RawCandidate
from search.fetch import fetch_and_extract


async def run_pipeline(niche: str, max_per_tier: int = 10) -> PipelineState:
    """Run full pipeline: search → dedup → deep-fetch → score.

    Returns final PipelineState with all results.
    """
    state: PipelineState = {
        "niche": niche,
        "max_leads_per_tier": max_per_tier,
        "tier1_candidates": [],
        "tier2_candidates": [],
        "tier3_candidates": [],
        "tier4_candidates": [],
        "tier5_candidates": [],
        "all_candidates": [],
        "deduped_candidates": [],
        "leads": [],
        "hot_leads": [],
        "warm_leads": [],
        "cold_leads": [],
        "skipped_leads": [],
        "errors": [],
    }

    # ── Phase 1: Search all tiers (including ATS APIs in tier5) ──
    results = await asyncio.gather(
        run_tier1(niche),
        run_tier2(niche),
        run_tier3(niche),
        run_tier4(niche),
        run_tier5(niche),
        return_exceptions=True,
    )

    tier_keys = [
        "tier1_candidates",
        "tier2_candidates",
        "tier3_candidates",
        "tier4_candidates",
        "tier5_candidates",
    ]
    all_candidates: list[RawCandidate] = []

    for key, result in zip(tier_keys, results):
        if isinstance(result, Exception):
            state["errors"].append(f"{key} failed: {result}")
            state[key] = []  # type: ignore[literal-required]
        else:
            candidates = result[:max_per_tier]  # type: ignore[index]
            state[key] = candidates  # type: ignore[literal-required]
            all_candidates.extend(candidates)

    state["all_candidates"] = all_candidates

    # ── Phase 2: Dedup ──
    deduped: list[RawCandidate] = []
    for c in all_candidates:
        temp = Lead(
            source=c.source,
            tier=c.tier,
            title=c.title,
            url=c.url,
            raw_text=c.raw_text or c.snippet,
            niche=niche,
        )
        dup_id = check_duplicate(temp)
        if dup_id is None:
            deduped.append(c)
    state["deduped_candidates"] = deduped

    # ── Phase 3: Deep fetch (fetch full job descriptions) ──
    enriched: list[RawCandidate] = []
    fetch_budget = 20  # max URLs to fetch per pipeline run
    fetched_count = 0

    for c in deduped:
        # Skip if already has rich content (from ATS APIs)
        if len(c.raw_text) > 500:
            enriched.append(c)
            continue

        if fetched_count >= fetch_budget:
            enriched.append(c)
            continue

        # Try to fetch and extract full content
        try:
            full_text = await fetch_and_extract(c.url, timeout=10)
            if full_text and len(full_text) > len(c.raw_text):
                c.raw_text = full_text[:2000]  # cap at 2000 chars
                fetched_count += 1
        except Exception:
            pass  # keep original snippet

        enriched.append(c)

    # ── Phase 4: Score against user profile ──
    profile = load_profile()

    leads: list[Lead] = []
    hot: list[Lead] = []
    warm: list[Lead] = []
    cold: list[Lead] = []
    skipped: list[Lead] = []

    cold_to_archive: list[Lead] = []

    for c in enriched:
        lead = score_against_profile(c, niche, profile)
        leads.append(lead)
        if lead.verdict == "HOT":
            hot.append(lead)
        elif lead.verdict == "WARM":
            warm.append(lead)
        elif lead.verdict == "COLD":
            cold.append(lead)
            cold_to_archive.append(lead)
        else:
            skipped.append(lead)
            cold_to_archive.append(lead)

        # Persist HOT/WARM to Chroma; COLD/SKIP go to cold archive instead
        if lead.verdict in ("HOT", "WARM"):
            with contextlib.suppress(Exception):
                upsert_lead(lead)

    # Archive cold/skipped leads to date-stamped JSONL
    archived_count = 0
    archive_path = ""
    if cold_to_archive:
        try:
            archive_path = str(
                archive_batch(cold_to_archive, tag="cold")
            )
            archived_count = len(cold_to_archive)
        except Exception as e:
            state["errors"].append(f"archive failed: {e}")

    state["leads"] = leads
    state["hot_leads"] = hot
    state["warm_leads"] = warm
    state["cold_leads"] = cold
    state["skipped_leads"] = skipped
    state["archived_count"] = archived_count
    state["archive_path"] = archive_path

    return state


# ── LangGraph wrapper (kept for future graph extensions) ──


def build_pipeline() -> StateGraph:
    """Build LangGraph pipeline (experimental — use run_pipeline for production)."""
    builder = StateGraph(PipelineState)
    builder.add_node("run_pipeline", _langgraph_wrapper)
    builder.add_edge(START, "run_pipeline")
    builder.add_edge("run_pipeline", END)
    return builder.compile()


async def _langgraph_wrapper(state: PipelineState) -> dict[str, Any]:
    """Adapter node that calls the real pipeline."""
    result = await run_pipeline(
        niche=state.get("niche", "plugin_dev"),
        max_per_tier=state.get("max_leads_per_tier", 10),
    )
    return dict(result)


# ── LangGraph node functions (for graph-based workflow) ──


async def search_all(state: PipelineState) -> dict[str, Any]:
    """LangGraph node: search all tiers for candidates."""
    result = await run_pipeline(
        niche=state.get("niche", "plugin_dev"),
        max_per_tier=state.get("max_leads_per_tier", 10),
    )
    return {
        "all_candidates": result.get("all_candidates", []),
        "tier1_candidates": result.get("tier1_candidates", []),
        "tier2_candidates": result.get("tier2_candidates", []),
        "tier3_candidates": result.get("tier3_candidates", []),
        "tier4_candidates": result.get("tier4_candidates", []),
        "tier5_candidates": result.get("tier5_candidates", []),
        "errors": result.get("errors", []),
    }


def route_by_verdict(state: PipelineState) -> str:
    """LangGraph conditional edge: route by verdict."""
    if state.get("hot_leads"):
        return "hot_path"
    if state.get("warm_leads"):
        return "warm_path"
    return "cold_path"
