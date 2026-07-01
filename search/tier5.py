"""Tier 5 — Direct ATS APIs: Greenhouse, Lever, Ashby.

Polls public job boards from audio companies directly. No scraping,
no aggregators, no Google search. Highest signal-to-noise source.
"""

from search.ats import fetch_all_ats_jobs
from search.base import RawCandidate


async def run(niche: str) -> list[RawCandidate]:
    """Fetch jobs from all configured ATS companies.

    The niche parameter is accepted for API consistency but ATS APIs
    don't filter by niche — we get all jobs and let the scorer filter.
    """
    return await fetch_all_ats_jobs()
