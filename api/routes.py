"""FastAPI route definitions for the freelance acquisition system."""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends

from api.auth import require_api_key
from leads.schema import Lead, LeadStatus, Verdict, PREFERRED_NICHES
from leads.store import (
    get_lead_by_id,
    get_leads_by_status,
    update_status,
    upsert_lead,
    search_leads,
    get_all_leads,
    delete_lead,
    check_ollama_available,
)
from search.base import RawCandidate
from graph.pipeline import run_pipeline
from scoring.score import score_candidate

router = APIRouter(dependencies=[Depends(require_api_key)])
public = APIRouter()  # no auth

from debug.log import setup_logger

log = setup_logger(__name__)


@public.get("/health")
async def health_check():
    """Health check endpoint."""
    ollama_ok = check_ollama_available()
    return {
        "status": "ok",
        "ollama": ollama_ok,
        "timestamp": datetime.now(tz=timezone.utc).isoformat(),
    }


@router.get("/leads")
async def list_leads(status: Optional[str] = None):
    """List leads, optionally filtered by status."""
    if status:
        try:
            status_enum = LeadStatus(status.upper())
            leads = get_leads_by_status(status_enum)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status}")
    else:
        leads = get_all_leads()

    return {
        "count": len(leads),
        "leads": [lead.model_dump(mode="json") for lead in leads],
    }


@router.get("/leads/{lead_id}")
async def get_lead(lead_id: str):
    """Get a single lead by ID."""
    try:
        lead = get_lead_by_id(lead_id)
    except Exception:
        raise HTTPException(status_code=400, detail=f"Invalid lead ID: {lead_id}")

    if lead is None:
        raise HTTPException(status_code=404, detail="Lead not found")
    return lead.model_dump(mode="json")


@router.post("/leads/{lead_id}/status")
async def change_lead_status(lead_id: str, new_status: str):
    """Update a lead's status."""
    try:
        status_enum = LeadStatus(new_status.upper())
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid status: {new_status}")

    try:
        update_status(lead_id, status_enum)
    except Exception as e:
        log.warning("update_status failed", extra={"lead_id": lead_id, "error": e})
        raise HTTPException(status_code=500, detail="Failed to update lead status")
    return {"status": "updated", "lead_id": lead_id, "new_status": new_status}


@router.post("/prospect/{niche}")
async def prospect_niche(niche: str):
    """Run the full search → dedup → score pipeline for a niche.

    Returns all scored leads with verdicts.
    """
    if niche not in PREFERRED_NICHES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown niche '{niche}'. Valid: {', '.join(PREFERRED_NICHES)}",
        )

    try:
        result = await run_pipeline(niche)
        return {
            "niche": niche,
            "total_candidates": len(result.get("all_candidates", [])),
            "total_leads": len(result.get("leads", [])),
            "hot": len(result.get("hot_leads", [])),
            "warm": len(result.get("warm_leads", [])),
            "cold": len(result.get("cold_leads", [])),
            "skipped": len(result.get("skipped_leads", [])),
            "errors": result.get("errors", []),
            "hot_leads": [
                lead.model_dump(mode="json") for lead in result.get("hot_leads", [])
            ],
            "warm_leads": [
                lead.model_dump(mode="json") for lead in result.get("warm_leads", [])
            ],
        }
    except Exception as e:
        log.warning("Pipeline failed", extra={"niche": niche, "error": e})
        raise HTTPException(status_code=500, detail="Pipeline processing failed. Check server logs.")


@router.post("/score")
async def score_manual(
    source: str,
    title: str,
    url: str,
    snippet: str,
    niche: str = "plugin_contract",
    company: Optional[str] = None,
):
    """Manually score a single raw candidate."""
    if niche not in PREFERRED_NICHES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown niche '{niche}'",
        )

    candidate = RawCandidate(
        source=source,
        title=title,
        url=url,
        snippet=snippet,
        company=company,
        raw_text=snippet,
        tier=1,
    )
    lead = score_candidate(candidate, niche)

    try:
        upsert_lead(lead)
    except Exception as e:
        log.warning("Storage failed", extra={"lead_id": str(lead.id), "error": e})
        raise HTTPException(status_code=500, detail="Failed to store lead.")

    return lead.model_dump(mode="json")


@router.post("/translate")
async def translate_tech(technical_description: str):
    """Translate a technical capability into client-facing value."""
    from generate.translate import translate_capability

    result = translate_capability(technical_description)
    return result


@router.post("/rate")
async def rate_work(task_description: str, estimated_hours: int):
    """Generate rate tiers for a given task."""
    from generate.rate import generate_rate

    result = generate_rate(task_description, estimated_hours)
    return result


@router.post("/outreach/{lead_id}")
async def generate_outreach_draft(lead_id: str, template_key: str = "A_plugin_contract"):
    """Generate an outreach draft for a lead using a template."""
    from generate.outreach import generate_outreach

    lead = get_lead_by_id(lead_id)
    if lead is None:
        raise HTTPException(status_code=404, detail="Lead not found")

    result = generate_outreach(lead, template_key)
    return result


@router.post("/proposal")
async def create_proposal(
    lead_id: str,
    client_name: str,
    scope: str,
    deliverables: list[str],
    out_of_scope: list[str] = [],
    estimated_tier: str = "medium",
):
    """Generate a structured proposal for a lead."""
    from generate.proposal import generate_proposal

    lead = get_lead_by_id(lead_id)
    if lead is None:
        raise HTTPException(status_code=404, detail="Lead not found")

    result = generate_proposal(
        lead=lead,
        client_name=client_name,
        scope=scope,
        deliverables=deliverables,
        out_of_scope=out_of_scope,
        estimated_tier=estimated_tier,
    )
    return result


@router.get("/status")
async def pipeline_status():
    """Pipeline status snapshot: lead counts by status, last runs, overdues."""
    counts = {}
    for status in LeadStatus:
        try:
            leads = get_leads_by_status(status)
            counts[status.value] = len(leads)
        except Exception:
            counts[status.value] = 0

    return {
        "lead_counts": counts,
        "ollama_available": check_ollama_available(),
        "timestamp": datetime.now(tz=timezone.utc).isoformat(),
    }


@router.post("/debug")
async def run_debug():
    """Run diagnostics sweep (Tier 6)."""
    from debug.diagnostics import run_diagnostics

    report = run_diagnostics()
    return report


# ── Market Research (Phase 5) ──


@router.get("/market")
async def market_overview():
    """Quick snapshot: what's in demand, trending tech, pricing benchmarks."""
    from research.market import generate_report

    report = await generate_report()
    return report


@router.get("/market/trends")
async def market_trends():
    """Technology trends only — what skills/technologies are rising."""
    from research.market import run_market_scan

    report = await run_market_scan()
    return {
        "scanned_at": report.scanned_at,
        "tech_trends": [
            {
                "technology": t.technology,
                "mentions": t.mention_count,
                "direction": t.direction,
                "contexts": t.contexts,
            }
            for t in sorted(report.tech_trends, key=lambda x: -x.mention_count)
        ],
    }


@router.get("/market/pricing")
async def market_pricing():
    """Pricing intelligence — what niches pay what."""
    from research.market import run_market_scan

    report = await run_market_scan()
    return {
        "scanned_at": report.scanned_at,
        "pricing_benchmarks": [
            {
                "niche": p.niche,
                "contract_range_min": p.contract_range_min,
                "contract_range_max": p.contract_range_max,
                "hourly_min": p.hourly_min,
                "hourly_max": p.hourly_max,
                "sample_count": p.sample_count,
            }
            for p in sorted(report.pricing_benchmarks, key=lambda x: -x.contract_range_max)
        ],
    }


@router.get("/market/opportunities")
async def market_opportunities():
    """Actionable opportunity signals — what to pursue right now."""
    from research.market import run_market_scan

    report = await run_market_scan()
    return {
        "scanned_at": report.scanned_at,
        "summary": report.summary,
        "opportunities": report.hot_opportunities,
        "recent_signals": [
            {
                "category": s.category,
                "title": s.title,
                "url": s.url,
                "snippet": s.snippet[:200],
                "tags": s.tags,
            }
            for s in sorted(report.signals, key=lambda x: -x.relevance_score)[:20]
        ],
    }
