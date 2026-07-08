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
        "translations": {},
        "outreach_drafts": {},
        "review_queue": [],
        "notified": False,
        "awaiting_approval": False,
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
            import logging

            logging.getLogger("graph").debug("Deep fetch failed, keeping original snippet.")

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
            archive_path = str(archive_batch(cold_to_archive, tag="cold"))
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
    """Build full LangGraph pipeline with search → score → generate → review workflow."""
    builder = StateGraph(PipelineState)

    builder.add_node("search_all", search_all)
    builder.add_node("generate_translate", generate_translate)
    builder.add_node("generate_outreach", generate_outreach)
    builder.add_node("queue_for_review", queue_for_review)
    builder.add_node("notify_hot", notify_hot)
    builder.add_node("await_human_send", await_human_send)

    builder.add_edge(START, "search_all")
    builder.add_edge("search_all", "generate_translate")
    builder.add_edge("generate_translate", "generate_outreach")
    builder.add_edge("generate_outreach", "queue_for_review")
    builder.add_edge("queue_for_review", "notify_hot")
    builder.add_edge("notify_hot", "await_human_send")
    builder.add_edge("await_human_send", END)

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


async def generate_translate(state: PipelineState) -> dict[str, Any]:
    """LangGraph node: generate client-facing translations for HOT leads."""
    from generate.translate import translate_capability

    hot_leads = state.get("hot_leads", [])
    translations = {}
    for lead in hot_leads[:3]:  # ponytail: top 3 only
        try:
            result = translate_capability(lead.raw_text[:500])
            translations[str(lead.id)] = result
        except Exception:
            translations[str(lead.id)] = {"error": "translation failed"}
    return {"translations": translations}


async def generate_outreach(state: PipelineState) -> dict[str, Any]:
    """LangGraph node: generate outreach drafts for HOT leads."""
    from generate.outreach import generate_outreach

    hot_leads = state.get("hot_leads", [])
    drafts = {}
    for lead in hot_leads[:3]:
        try:
            result = generate_outreach(lead, template_key="A_plugin_contract")
            drafts[str(lead.id)] = result
        except Exception:
            drafts[str(lead.id)] = {"error": "outreach generation failed"}
    return {"outreach_drafts": drafts}


async def queue_for_review(state: PipelineState) -> dict[str, Any]:
    """LangGraph node: queue HOT leads with drafts for human review."""
    hot_leads = state.get("hot_leads", [])
    return {
        "review_queue": [
            {
                "lead_id": str(lead.id),
                "title": lead.title,
                "company": lead.company,
                "score": lead.score,
                "has_draft": str(lead.id) in state.get("outreach_drafts", {}),
            }
            for lead in hot_leads
        ]
    }


async def notify_hot(state: PipelineState) -> dict[str, Any]:
    """LangGraph node: notify about HOT leads (logs + future Slack/MCP hook)."""
    import logging

    logger = logging.getLogger("uvicorn")
    hot_count = len(state.get("hot_leads", []))
    if hot_count > 0:
        logger.info(f"HOT leads found: {hot_count}. Review queue ready.")
    return {"notified": hot_count > 0}


async def await_human_send(state: PipelineState) -> dict[str, Any]:
    """LangGraph node: marks pipeline as awaiting human approval before sending."""
    return {
        "awaiting_approval": True,
        "message": "Review outreach drafts and approve before sending.",
    }
