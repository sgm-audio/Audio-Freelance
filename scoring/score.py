"""Main scoring pipeline: candidate → scored lead with verdict."""

import os
import re
from pathlib import Path

from dotenv import load_dotenv
from leads.schema import Lead, LeadStatus, Verdict
from scoring.signals import (
    NEGATIVE_SIGNALS,
    POSITIVE_SIGNALS,
    check_hard_skip,
    extract_signals,
)
from search.base import RawCandidate

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

# Thresholds configurable via .env (fallback to reality-tested defaults)
_HOT_THRESHOLD = int(os.getenv("HOT_THRESHOLD", "10"))
_WARM_THRESHOLD = int(os.getenv("WARM_THRESHOLD", "5"))
_MIN_RATE_CAD = int(os.getenv("MIN_RATE_CAD", "3000"))
_HOURLY_FLOOR_CAD = int(os.getenv("HOURLY_FLOOR_CAD", "150"))


def _parse_budget(text: str) -> int | None:
    """Extract a budget from raw text, handling $5K shorthand, ranges, and hourly."""
    # K-notation shorthands: "$5K", "$150K contract", "10k budget", "rate: 3k"
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

    # Standard dollar notation
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


def _is_aggregator_page(title: str) -> bool:
    """Detect directory/listing pages that are not actual job postings.

    Matches patterns like '234 Freelance Audio Engineer jobs in United States'
    or 'Hire the 69 Best Remote...' that are search result pages, not leads.
    """
    if re.search(r"^\d+\s+.*?\b(?:jobs?|positions?)\s+(?:in|across|at)\b", title, re.IGNORECASE):
        return True
    if re.search(r"^\d+\s+.*?\b(?:results?|openings?)\b", title, re.IGNORECASE):
        return True
    if re.search(r"\bhire\s+the\s+\d+\s+best\b", title, re.IGNORECASE):
        return True
    return False


def score_candidate(
    candidate: RawCandidate,
    niche: str,
    min_rate: int = _MIN_RATE_CAD,
    hourly_floor: int = _HOURLY_FLOOR_CAD,
) -> Lead:
    combined_text = f"{candidate.title} {candidate.snippet} {candidate.raw_text}"

    # Step 0: Aggregator / listing-page guard
    if _is_aggregator_page(candidate.title):
        return Lead(
            source=candidate.source,
            tier=candidate.tier,
            title=candidate.title,
            company=candidate.company,
            url=candidate.url,
            raw_text=candidate.raw_text,
            niche=niche,
            signals={"aggregator_page": -50},
            score=-50,
            verdict="COLD",
            status=LeadStatus.COLD,
        )

    # Step 1: Hard skip
    if check_hard_skip(combined_text):
        return Lead(
            source=candidate.source,
            tier=candidate.tier,
            title=candidate.title,
            company=candidate.company,
            url=candidate.url,
            raw_text=candidate.raw_text,
            niche=niche,
            signals={"hard_skip": -999},
            score=0,
            verdict="SKIP",
            status=LeadStatus.SKIPPED,
        )

    # Step 2: Extract signals
    signals: dict[str, int] = {}
    for name, points in extract_signals(combined_text, POSITIVE_SIGNALS).items():
        signals[name] = points
    for name, points in extract_signals(combined_text, NEGATIVE_SIGNALS).items():
        signals[name] = points

    # Step 3: Budget
    budget = _parse_budget(combined_text)
    if budget is not None:
        if budget >= min_rate:
            signals["budget_above_floor"] = 10
        else:
            signals["budget_below_floor"] = -15

    # Step 4: Verdict
    total = sum(signals.values())

    if total >= _HOT_THRESHOLD:
        verdict: Verdict = "HOT"
        status = LeadStatus.HOT
    elif total >= _WARM_THRESHOLD:
        verdict = "WARM"
        status = LeadStatus.WARM
    elif total > -500:
        verdict = "COLD"
        status = LeadStatus.COLD
    else:
        verdict = "SKIP"
        status = LeadStatus.SKIPPED

    return Lead(
        source=candidate.source,
        tier=candidate.tier,
        title=candidate.title,
        company=candidate.company,
        url=candidate.url,
        raw_text=candidate.raw_text,
        niche=niche,
        signals=signals,
        score=total,
        verdict=verdict,
        status=status,
    )
