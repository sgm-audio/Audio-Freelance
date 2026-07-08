"""FastAPI route definitions for the freelance acquisition system."""

import contextlib
import shutil
import uuid
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from api.auth import require_api_key
from config import settings
from debug.log import setup_logger
from graph.pipeline import run_pipeline
from leads.schema import PREFERRED_NICHES, LeadStatus
from leads.store import (
    check_ollama_available,
    get_all_leads,
    get_lead_by_id,
    get_leads_by_status,
    update_status,
    upsert_lead,
)
from scoring.score import score_candidate
from search.base import RawCandidate

router = APIRouter(dependencies=[Depends(require_api_key)])
public = APIRouter()  # no auth

log = setup_logger(__name__)


# ── Pydantic request models ──


class ProfileUpdateRequest(BaseModel):
    """Validation model for profile updates."""

    model_config = {"extra": "forbid"}

    identity: dict | None = None
    skills: dict | None = None
    preferences: dict | None = None
    experience: dict | None = None
    portfolio: dict | None = None


class ScoreRequest(BaseModel):
    source: str
    title: str
    url: str
    snippet: str
    niche: str = "plugin_dev"
    company: str | None = None


class LeadStatusUpdate(BaseModel):
    new_status: str = Field(min_length=1)


@public.get("/health")
async def health_check():
    """Health check endpoint."""
    ollama_ok = check_ollama_available()
    return {
        "status": "ok",
        "ollama": ollama_ok,
        "timestamp": datetime.now(tz=UTC).isoformat(),
    }


@router.get("/leads")
async def list_leads(status: str | None = None):
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
async def change_lead_status(lead_id: str, body: LeadStatusUpdate):
    """Update a lead's status."""
    try:
        status_enum = LeadStatus(body.new_status.upper())
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid status: {body.new_status}")

    try:
        update_status(lead_id, status_enum)
    except Exception as e:
        log.warning("update_status failed", extra={"lead_id": lead_id, "error": e})
        raise HTTPException(status_code=500, detail="Failed to update lead status")
    return {"status": "updated", "lead_id": lead_id, "new_status": body.new_status}


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
            "archived": result.get("archived_count", 0),
            "archive_path": result.get("archive_path", ""),
            "errors": result.get("errors", []),
            "hot_leads": [lead.model_dump(mode="json") for lead in result.get("hot_leads", [])],
            "warm_leads": [lead.model_dump(mode="json") for lead in result.get("warm_leads", [])],
        }
    except Exception as e:
        log.warning("Pipeline failed", extra={"niche": niche, "error": e})
        raise HTTPException(
            status_code=500,
            detail="Pipeline processing failed. Check server logs.",
        )


@router.post("/score")
async def score_manual(body: ScoreRequest):
    """Manually score a single raw candidate."""
    if body.niche not in PREFERRED_NICHES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown niche '{body.niche}'",
        )

    candidate = RawCandidate(
        source=body.source,
        title=body.title,
        url=body.url,
        snippet=body.snippet,
        company=body.company,
        raw_text=body.snippet,
        tier=1,
    )
    lead = score_candidate(candidate, body.niche)

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
        "timestamp": datetime.now(tz=UTC).isoformat(),
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


# ── Cold-lead archive ──


@router.get("/leads/cold")
async def list_cold_leads(days: int = 7, niche: str | None = None):
    """List recently archived cold leads from archive JSONL files."""
    import json
    from datetime import UTC, datetime, timedelta

    from leads.store import ARCHIVE_DIR

    cutoff = datetime.now(tz=UTC) - timedelta(days=days)
    leads: list[dict] = []

    if not ARCHIVE_DIR.exists():
        return {"count": 0, "leads": []}

    for f in sorted(ARCHIVE_DIR.glob("cold_*.jsonl"), reverse=True):
        try:
            with open(f) as fh:
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    data = json.loads(line)
                    if niche and data.get("niche") != niche:
                        continue
                    disc = data.get("discovered_at", "")
                    if disc:
                        try:
                            dt = datetime.fromisoformat(disc)
                            if dt < cutoff:
                                continue
                        except (ValueError, TypeError):
                            pass
                    leads.append(data)
                    if len(leads) >= 200:
                        break
        except Exception:
            continue
        if len(leads) >= 200:
            break

    return {"count": len(leads), "leads": leads}


@router.get("/leads/cold/stats")
async def cold_lead_stats():
    """Stats for archived cold leads: count by niche/source."""
    import json
    from collections import Counter

    from leads.store import ARCHIVE_DIR

    niche_counts: Counter = Counter()
    source_counts: Counter = Counter()
    total = 0

    if ARCHIVE_DIR.exists():
        for f in ARCHIVE_DIR.glob("cold_*.jsonl"):
            try:
                with open(f) as fh:
                    for line in fh:
                        line = line.strip()
                        if not line:
                            continue
                        data = json.loads(line)
                        niche_counts[data.get("niche", "unknown")] += 1
                        source_counts[data.get("source", "unknown")] += 1
                        total += 1
            except Exception:
                continue

    return {
        "total_archived": total,
        "by_niche": dict(niche_counts.most_common()),
        "by_source": dict(source_counts.most_common()),
    }


@router.post("/leads/rotate-cold")
async def rotate_cold_leads(days: int = 3):
    """Explicit housekeeping: rotate COLD/WARM leads older than N days to archive."""
    from leads.store import _touch_rotation, ensure_collections_initialized, rotate_cold

    if not ensure_collections_initialized():
        raise HTTPException(status_code=503, detail="ChromaDB not available")

    archived, deleted = rotate_cold(age_days=days)
    _touch_rotation()  # Record timestamp so auto-rotation doesn't double-fire
    return {
        "archived": archived,
        "deleted": deleted,
        "message": f"Rotated {archived} leads to archive ({deleted} removed from active store).",
    }


@router.get("/leads/rotation-status")
async def rotation_status():
    """Check when the last rotation happened and if one is due."""
    from datetime import UTC, datetime

    from leads.store import get_last_rotation

    last = get_last_rotation()
    now = datetime.now(tz=UTC)
    return {
        "last_rotation": last.isoformat() if last else None,
        "hours_ago": round((now - last).total_seconds() / 3600, 1) if last else None,
        "rotation_due_days": settings.cold_rotation_days,
    }


# ── Tracking & pursuits ──


@router.get("/tracking")
async def tracking_overview(limit: int = 50):
    """Recent tracking events across all leads."""
    from leads.tracking import get_all_tracking

    events = get_all_tracking(limit=limit)
    return {"count": len(events), "events": events}


@router.get("/tracking/{lead_id}")
async def lead_tracking(lead_id: str):
    """All tracking events for a specific lead."""
    from leads.store import get_lead_by_id
    from leads.tracking import get_tracking_history

    lead = get_lead_by_id(lead_id)
    if lead is None:
        raise HTTPException(status_code=404, detail="Lead not found")

    events = get_tracking_history(lead_id)
    return {
        "lead_id": lead_id,
        "lead_title": lead.title,
        "lead_status": lead.status.value,
        "events": events,
    }


@router.get("/tracking/active")
async def active_pursuits():
    """Leads currently in active pursuit (CONTACTED/REPLIED/PROPOSAL_SENT)."""
    from leads.store import get_lead_by_id
    from leads.tracking import get_active_pursuit_lead_ids, get_tracking_history

    active_ids = get_active_pursuit_lead_ids()
    pursuits = []
    for lid in active_ids:
        lead = get_lead_by_id(lid)
        if lead is None:
            continue
        events = get_tracking_history(lid)
        last_event = events[-1] if events else None
        pursuits.append(
            {
                "lead": lead.model_dump(mode="json"),
                "last_event": last_event,
                "total_events": len(events),
            }
        )

    pursuits.sort(key=lambda p: p["lead"]["last_updated"], reverse=True)
    return {"count": len(pursuits), "active": pursuits}


@router.post("/tracking/triage")
async def reply_triage(reply_text: str, lead_id: str):
    """Classify a lead reply and recommend next action."""
    from generate.triage import classify_reply

    lead = get_lead_by_id(lead_id)
    context = None
    if lead:
        context = {
            "status": lead.status.value,
            "score": lead.score,
            "niche": lead.niche,
            "company": lead.company,
        }

    result = classify_reply(reply_text, context)
    result.lead_id = lead_id
    if lead:
        result.lead_title = lead.title
        result.lead_company = lead.company or ""

    return {
        "lead_id": result.lead_id,
        "lead_title": result.lead_title,
        "lead_company": result.lead_company,
        "classification": result.classification,
        "confidence": result.confidence,
        "reasoning": result.reasoning,
        "suggested_response": result.suggested_response,
        "suggested_action": result.suggested_action,
    }


@router.post("/tracking/triage/batch")
async def batch_reply_triage(replies: list[dict]):
    """Classify multiple replies at once."""
    from generate.triage import classify_reply

    results = []
    for r in replies:
        lead_id = r.get("lead_id", "")
        lead = None
        context = None
        with contextlib.suppress(Exception):
            lead = get_lead_by_id(lead_id)
        if lead:
            context = {
                "status": lead.status.value,
                "score": lead.score,
                "niche": lead.niche,
                "company": lead.company,
            }
        result = classify_reply(r.get("reply_text", ""), context)
        result.lead_id = lead_id
        if lead:
            result.lead_title = lead.title
            result.lead_company = lead.company or ""
        results.append(
            {
                "lead_id": result.lead_id,
                "lead_title": result.lead_title,
                "classification": result.classification,
                "confidence": result.confidence,
                "suggested_action": result.suggested_action,
            }
        )
    return {"count": len(results), "results": results}


@router.get("/tracking/won-lost")
async def won_lost_summary():
    """Summary of won and lost leads, for pipeline effectiveness tracking."""
    from collections import Counter
    from datetime import UTC, datetime

    from leads.schema import LeadStatus
    from leads.store import get_leads_by_status
    from leads.tracking import get_active_pursuit_lead_ids

    won = get_leads_by_status(LeadStatus.WON)
    lost = get_leads_by_status(LeadStatus.LOST)
    active = get_active_pursuit_lead_ids()

    niche_won: Counter = Counter()
    niche_lost: Counter = Counter()
    for lead in won:
        niche_won[lead.niche] += 1
    for lead in lost:
        niche_lost[lead.niche] += 1

    return {
        "won": len(won),
        "lost": len(lost),
        "active_pursuits": len(active),
        "win_rate": round(len(won) / max(len(won) + len(lost), 1) * 100, 1),
        "by_niche": {
            "won": dict(niche_won),
            "lost": dict(niche_lost),
        },
        "timestamp": datetime.now(tz=UTC).isoformat(),
    }


# ── Profile (personalization) ──


@public.get("/profile/status")
async def profile_status():
    """Check if a profile exists (for first-boot detection)."""
    from scoring.profile import load_profile, profile_exists

    exists = profile_exists()
    profile = load_profile() if exists else None
    return {
        "exists": exists,
        "is_empty": profile.is_empty() if profile else True,
        "completeness": profile.completeness() if profile else 0,
    }


@router.get("/profile")
async def get_profile():
    """Get the current user profile."""
    from scoring.profile import load_profile

    profile = load_profile()
    return profile.to_dict()


@router.post("/profile")
async def update_profile(profile_data: ProfileUpdateRequest):
    """Update the user profile."""
    from scoring.profile import _dict_to_profile, save_profile

    try:
        profile = _dict_to_profile(profile_data.model_dump())
    except Exception as e:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Invalid profile data: {e}. "
                "Expected keys: identity, skills, preferences, experience, portfolio."
            ),
        )
    save_profile(profile)
    return {"status": "saved", "profile": profile.to_dict()}


@router.delete("/profile")
async def delete_profile():
    """Delete the user profile (reset to empty)."""
    from scoring.profile import get_profile_path

    path = get_profile_path()
    if path.exists():
        path.unlink()
    return {"status": "deleted"}


@router.post("/profile/upload")
async def upload_profile_file(file: UploadFile = File(...), file_type: str = "resume"):
    """Upload resume or portfolio file. Stored in assets/portfolio/."""
    if file.content_type and not file.content_type.startswith(
        (
            "application/pdf",
            "image/",
            "application/msword",
            "application/vnd.openxmlformats-officedocument",
        )
    ):
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {file.content_type}")

    if file.size and file.size > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")

    upload_dir = Path(__file__).resolve().parent.parent / "assets" / "portfolio"
    upload_dir.mkdir(parents=True, exist_ok=True)

    safe_name = f"{uuid.uuid4()}_{file.filename}"
    file_path = upload_dir / safe_name

    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    return {
        "status": "uploaded",
        "filename": file.filename,
        "path": str(file_path.relative_to(Path(__file__).resolve().parent.parent)),
        "type": file_type,
    }


# ── Companies (ATS tracking) ──


@router.get("/companies")
async def list_companies():
    """List all tracked ATS companies."""
    from search.ats import load_companies

    companies = load_companies()
    return {
        "greenhouse": companies.get("greenhouse", []),
        "lever": companies.get("lever", []),
        "ashby": companies.get("ashby", []),
        "total": sum(len(v) for v in companies.values()),
    }


@router.post("/companies")
async def add_company(ats: str, slug: str):
    """Add a company to track on a specific ATS."""
    from search.ats import get_companies_path, load_companies

    if ats not in ("greenhouse", "lever", "ashby"):
        raise HTTPException(status_code=400, detail=f"Invalid ATS: {ats}")

    companies = load_companies()
    if slug not in companies.get(ats, []):
        companies.setdefault(ats, []).append(slug)

    # Save back
    import yaml

    path = get_companies_path()
    with open(path, "w") as f:
        yaml.dump(companies, f, default_flow_style=False)

    return {"status": "added", "ats": ats, "slug": slug}


@router.delete("/companies")
async def remove_company(ats: str, slug: str):
    """Remove a company from tracking."""
    from search.ats import get_companies_path, load_companies

    if ats not in ("greenhouse", "lever", "ashby"):
        raise HTTPException(status_code=400, detail=f"Invalid ATS: {ats}")

    companies = load_companies()
    if slug in companies.get(ats, []):
        companies[ats].remove(slug)

    import yaml

    path = get_companies_path()
    with open(path, "w") as f:
        yaml.dump(companies, f, default_flow_style=False)

    return {"status": "removed", "ats": ats, "slug": slug}


# ── Blocked companies ──


@router.get("/profile/blocked")
async def get_blocked_companies():
    """List all blocked companies from the user's profile."""
    from scoring.profile import load_profile

    profile = load_profile()
    return {"blocked_companies": profile.blocked_companies}


@router.post("/profile/blocked")
async def add_blocked_company(company: str):
    """Add a company to the blocklist. Supports name or domain."""
    from scoring.profile import load_profile, save_profile

    profile = load_profile()
    company = company.strip().lower()
    if company and company not in profile.blocked_companies:
        profile.blocked_companies.append(company)
        save_profile(profile)
    return {"status": "added", "blocked_companies": profile.blocked_companies}


@router.delete("/profile/blocked")
async def remove_blocked_company(company: str):
    """Remove a company from the blocklist."""
    from scoring.profile import load_profile, save_profile

    profile = load_profile()
    company = company.strip().lower()
    profile.blocked_companies = [c for c in profile.blocked_companies if c != company]
    save_profile(profile)
    return {"status": "removed", "blocked_companies": profile.blocked_companies}
