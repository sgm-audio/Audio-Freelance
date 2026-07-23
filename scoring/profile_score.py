"""Profile-driven scoring: score candidates against the user's profile.

This is the personalized layer that replaces generic signal-based scoring.
With an empty profile, it falls back to generic scoring (no filtering).
With a full profile, it scores based on skills match, dealbreakers, rate,
seniority, and contract type.
"""

import re

from config import settings
from leads.schema import Lead, LeadStatus
from scoring.profile import Profile
from scoring.signals import (
    NEGATIVE_SIGNALS,
    POSITIVE_SIGNALS,
    check_hard_skip,
    classify_verdict,
    extract_signals,
    is_aggregator_page,
)
from search.base import RawCandidate, extract_contact_path


def _text_lower(*parts: str) -> str:
    return " ".join(p or "" for p in parts).lower()


def _any_match(text: str, terms: list[str]) -> bool:
    """True if any term appears in text (case-insensitive)."""
    if not terms:
        return False
    return any(t.lower() in text for t in terms)


def _count_overlap(text: str, terms: list[str]) -> int:
    """Count how many terms appear in text."""
    if not terms:
        return 0
    return sum(1 for t in terms if t.lower() in text)


def score_against_profile(
    candidate: RawCandidate,
    niche: str,
    profile: Profile,
) -> Lead:
    """Score a candidate against the user's profile.

    Returns a Lead with verdict, score, and signals reflecting profile match.
    Empty profile = no filtering (generic scoring only).
    """
    combined_text = _text_lower(candidate.title, candidate.snippet, candidate.raw_text)
    signals: dict[str, int] = {}
    contact = candidate.contact_path or extract_contact_path(
        candidate.raw_text, candidate.snippet, candidate.title
    )
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

    # ── Step 0: Aggregator / listing-page guard (same as score_candidate) ──
    if is_aggregator_page(candidate.title):
        return Lead(
            **base,
            signals={"aggregator_page": -50},
            score=-50,
            verdict="COLD",
            status=LeadStatus.COLD,
        )

    # ── Step 1: Hard skip on dealbreakers (profile-driven) ──
    if profile.dealbreakers and _any_match(combined_text, profile.dealbreakers):
        return Lead(
            **base,
            signals={"dealbreaker": -999},
            score=0,
            verdict="SKIP",
            status=LeadStatus.SKIPPED,
        )

    # ── Step 2: Hard skip on excluded niches ──
    if profile.excluded_niches and niche in profile.excluded_niches:
        return Lead(
            **base,
            signals={"excluded_niche": -999},
            score=0,
            verdict="SKIP",
            status=LeadStatus.SKIPPED,
        )

    # ── Step 3: Blocked companies guard ──
    if profile.blocked_companies:
        company_text = " ".join([candidate.company or "", combined_text])
        for blocked in profile.blocked_companies:
            if blocked.lower() in company_text.lower():
                return Lead(
                    **base,
                    signals={"blocked_company": -999},
                    score=0,
                    verdict="SKIP",
                    status=LeadStatus.SKIPPED,
                )

    # ── Step 4: Generic hard-skip keywords (revenue share, equity only, etc.) ──
    if check_hard_skip(combined_text):
        return Lead(
            **base,
            signals={"hard_skip": -999},
            score=0,
            verdict="SKIP",
            status=LeadStatus.SKIPPED,
        )

    # ── Step 5: Generic signal extraction (always runs) ──
    for name, points in extract_signals(combined_text, POSITIVE_SIGNALS).items():
        signals[name] = signals.get(name, 0) + points
    for name, points in extract_signals(combined_text, NEGATIVE_SIGNALS).items():
        signals[name] = signals.get(name, 0) + points

    # ── Step 6: Profile-driven scoring (only if profile has data) ──
    if not profile.is_empty():
        # Skills match: +5 per language overlap, +4 per framework overlap
        lang_overlap = _count_overlap(combined_text, profile.languages)
        if lang_overlap > 0:
            signals["skills_language_match"] = lang_overlap * 5

        framework_overlap = _count_overlap(combined_text, profile.frameworks)
        if framework_overlap > 0:
            signals["skills_framework_match"] = framework_overlap * 4

        # Domain match: +3 per domain overlap
        domain_overlap = _count_overlap(combined_text, profile.domains)
        if domain_overlap > 0:
            signals["domain_match"] = domain_overlap * 3

        # Specialization match: +2 per overlap
        spec_overlap = _count_overlap(combined_text, profile.specializations)
        if spec_overlap > 0:
            signals["specialization_match"] = spec_overlap * 2

        # Seniority match: +3 if candidate mentions user's seniority level
        if profile.seniority and _any_match(combined_text, profile.seniority):
            signals["seniority_match"] = 3

        # Seniority mismatch: -10 if candidate is junior/intern and user is senior+
        junior_terms = ["junior", "intern", "entry-level", "graduate"]
        senior_levels = ["senior", "lead", "staff", "principal"]
        if profile.seniority and any(s in senior_levels for s in profile.seniority):
            if _any_match(combined_text, junior_terms):
                signals["seniority_mismatch"] = -10

        # Contract type match: +3 if candidate mentions user's preferred types
        if profile.contract_types and _any_match(combined_text, profile.contract_types):
            signals["contract_type_match"] = 3

        # Rate floor check (if profile has a floor)
        if profile.rate_floor > 0:
            budget = _parse_budget(combined_text)
            if budget is not None:
                if budget >= profile.rate_floor:
                    signals["rate_above_floor"] = 8
                else:
                    signals["rate_below_floor"] = -15

    # ── Step 7: Conjunctive verdict (tech + intent; HOT also needs fit) ──
    total = sum(signals.values())
    verdict, status = classify_verdict(
        signals,
        total,
        hot_threshold=settings.hot_threshold,
        warm_threshold=settings.warm_threshold,
    )

    return Lead(
        **base,
        signals=signals,
        score=total,
        verdict=verdict,
        status=status,
    )


def _parse_budget(text: str) -> int | None:
    """Extract a budget from raw text."""
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
