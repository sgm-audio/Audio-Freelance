"""Multi-tier search layer for freelance lead sourcing."""

from search.ats import (
    fetch_all_ats_jobs,
    fetch_ashby_jobs,
    fetch_greenhouse_jobs,
    fetch_lever_jobs,
)
from search.base import RawCandidate, SearchResult, web_search
from search.fetch import fetch_and_extract, is_aggregator_url, is_job_url
from search.tier1 import run as run_tier1
from search.tier2 import run as run_tier2
from search.tier3 import run as run_tier3
from search.tier4 import run as run_tier4
from search.tier5 import run as run_tier5

__all__ = [
    "RawCandidate",
    "SearchResult",
    "web_search",
    "run_tier1",
    "run_tier2",
    "run_tier3",
    "run_tier4",
    "run_tier5",
    "fetch_and_extract",
    "is_aggregator_url",
    "is_job_url",
    "fetch_all_ats_jobs",
    "fetch_greenhouse_jobs",
    "fetch_lever_jobs",
    "fetch_ashby_jobs",
]
