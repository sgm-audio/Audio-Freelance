"""Main scoring pipeline: candidate → scored lead with verdict."""

import re

from config import settings
from leads.schema import Lead, LeadStatus
from scoring.signals import (
    NEGATIVE_SIGNALS,
    POSITIVE_SIGNALS,
    check_hard_skip,
    classify_verdict,
    extract_signals,
    is_aggregator_page,
)
from search.base import RawCandidate, extract_contact_path

_HOT_THRESHOLD = settings.hot_threshold
_WARM_THRESHOLD = settings.warm_threshold
_MIN_RATE_CAD = settings.min_rate_cad
_HOURLY_FLOOR_CAD = settings.hourly_floor_cad


def _parse_budget(text: str) -> int | None:
    """Extract a budget from raw text, handling $5K shorthand, ranges, and hourly."""
    for pat in [
        r"\$\s*(\d+)\s*k\b",
        r"\b(\d{2,4})\s*k\s*(?:budget|contract|usd|cad|freelance|remote)",
        r"rate\s+(?:is|of|around)?\s*\$?\s*(\d{2,3})\s*k",
    ]:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            val = int(m.group(1)) * 1000
            if val >= 500:
                return val

    patterns = [
        r"\$\s*((?:\d{4,10}|\d{1,3}(?:,\d{3})*))(?:\.\d{2})?\s*(?:cad|usd)?",
        r"(\d{4,5})\s*(?:cad|usd|dollars)",
        r"budget\s*(?:of\s*)?[:$]?\s*\$?(\d[\d,]*)",
        r"rate\s*(?:of\s*)?[:$]?\s*((?:\d{4,10}|\d{1,3}(?:,\d{3})*))",
        r"\b\$(\d{2,3}(?:,\d{3})*)\s*(?:/hr|/hour|\s*(?:per|an?)\s*hour)",
    ]
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            val = int(m.group(1).replace(",", ""))
            if val >= 100:
                return val
    return None


def _resolve_contact(candidate: RawCandidate) -> str | None:
    return candidate.contact_path or extract_contact_path(
        candidate.raw_text, candidate.snippet, candidate.title
    )


def score_candidate(
    candidate: RawCandidate,
    niche: str,
    min_rate: int = _MIN_RATE_CAD,
    hourly_floor: int = _HOURLY_FLOOR_CAD,
) -> Lead:
    combined_text = f"{candidate.title} {candidate.snippet} {candidate.raw_text}"
    contact = _resolve_contact(candidate)
    base = dict(
        source=candidate.source,
        tier=candidate.tier,
        title=candidate.title,
        company=candidate.company,
        url=candidate.url,
        raw_text=candidate.raw_text,
        niche=niche,
        contact_path=contact,
    )

    if is_aggregator_page(candidate.title):
        return Lead(
            **base,
            signals={"aggregator_page": -50},
            score=-50,
            verdict="COLD",
            status=LeadStatus.COLD,
        )

    if check_hard_skip(combined_text):
        return Lead(
            **base,
            signals={"hard_skip": -999},
            score=0,
            verdict="SKIP",
            status=LeadStatus.SKIPPED,
        )

    signals: dict[str, int] = {}
    for name, points in extract_signals(combined_text, POSITIVE_SIGNALS).items():
        signals[name] = points
    for name, points in extract_signals(combined_text, NEGATIVE_SIGNALS).items():
        signals[name] = points

    budget = _parse_budget(combined_text)
    if budget is not None:
        if budget >= min_rate:
            signals["budget_above_floor"] = 10
        else:
            signals["budget_below_floor"] = -15

    total = sum(signals.values())
    verdict, status = classify_verdict(
        signals,
        total,
        hot_threshold=_HOT_THRESHOLD,
        warm_threshold=_WARM_THRESHOLD,
    )

    return Lead(
        **base,
        signals=signals,
        score=total,
        verdict=verdict,
        status=status,
    )
