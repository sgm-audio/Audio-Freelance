"""Direct ATS (Applicant Tracking System) API clients.

Polls public job boards from Greenhouse, Lever, and Ashby — no scraping,
no aggregators, no Google search. These are the highest signal-to-noise
sources for audio companies.

All three APIs are public and require no authentication.
"""

from pathlib import Path

import httpx
import yaml

from config import settings
from search.base import RawCandidate, extract_contact_path

# ── Company list loader ──


def get_companies_path() -> Path:
    """Return the path to companies.yaml."""
    return (
        Path(settings.companies_path)
        if settings.companies_path
        else Path(__file__).resolve().parent.parent / "data" / "companies.yaml"
    )


def load_companies() -> dict[str, list[str]]:
    """Load company list from companies.yaml.

    Returns dict mapping ATS name to list of company slugs:
    {"greenhouse": ["izotope", "nativeinstruments", ...],
     "lever": ["eventide", ...],
     "ashby": ["david-ai", ...]}
    """
    path = get_companies_path()
    if not path.exists():
        return {"greenhouse": [], "lever": [], "ashby": []}

    with open(path) as f:
        data = yaml.safe_load(f) or {}

    return {
        "greenhouse": data.get("greenhouse", []) or [],
        "lever": data.get("lever", []) or [],
        "ashby": data.get("ashby", []) or [],
    }


# ── Greenhouse client ──


async def fetch_greenhouse_jobs(company: str, timeout: int = 10) -> list[RawCandidate]:
    """Fetch jobs from a Greenhouse job board.

    API: https://boards-api.greenhouse.io/v1/boards/{company}/jobs
    No auth required for public boards.
    """
    url = f"https://boards-api.greenhouse.io/v1/boards/{company}/jobs"
    candidates: list[RawCandidate] = []

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(url, params={"content": "true"})
            resp.raise_for_status()
            data = resp.json()

            for job in data.get("jobs", []):
                title = job.get("title", "")
                job_url = job.get("absolute_url", "")
                location = job.get("location", {}).get("name", "")
                content = job.get("content", "")  # HTML
                departments = ", ".join(d.get("name", "") for d in job.get("departments", []))

                # Strip HTML for raw_text
                raw_text = _strip_html(content)
                if location:
                    raw_text = f"{location}\n\n{raw_text}"
                if departments:
                    raw_text = f"[{departments}]\n{raw_text}"

                candidates.append(
                    RawCandidate(
                        source=f"greenhouse:{company}",
                        title=title,
                        url=job_url,
                        snippet=raw_text[:500],
                        raw_text=raw_text[:2000],
                        company=company,
                        tier=5,
                        contact_path=extract_contact_path(
                            content, raw_text, apply_url=job_url
                        ),
                    )
                )
    except Exception:
        pass

    return candidates


# ── Lever client ──


async def fetch_lever_jobs(company: str, timeout: int = 10) -> list[RawCandidate]:
    """Fetch jobs from a Lever job board.

    API: https://api.lever.co/v0/postings/{company}?mode=json
    No auth required.
    """
    url = f"https://api.lever.co/v0/postings/{company}"
    params = {"mode": "json"}
    candidates: list[RawCandidate] = []

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()

            for posting in data if isinstance(data, list) else []:
                title = posting.get("text", "")
                job_url = posting.get("hostedUrl", "")
                description = posting.get("description", "")  # HTML
                categories = posting.get("categories", {})
                location = categories.get("location", "")
                commitment = categories.get("commitment", "")

                raw_text = _strip_html(description)
                if location:
                    raw_text = f"{location}\n\n{raw_text}"
                if commitment:
                    raw_text = f"[{commitment}]\n{raw_text}"

                candidates.append(
                    RawCandidate(
                        source=f"lever:{company}",
                        title=title,
                        url=job_url,
                        snippet=raw_text[:500],
                        raw_text=raw_text[:2000],
                        company=company,
                        tier=5,
                        contact_path=extract_contact_path(
                            description, raw_text, apply_url=job_url
                        ),
                    )
                )
    except Exception:
        pass

    return candidates


# ── Ashby client ──


async def fetch_ashby_jobs(company: str, timeout: int = 10) -> list[RawCandidate]:
    """Fetch jobs from an Ashby job board.

    API: https://api.ashbyhq.com/posting-api/job-board/{company}
    No auth required.
    """
    url = f"https://api.ashbyhq.com/posting-api/job-board/{company}"
    candidates: list[RawCandidate] = []

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()

            for job in data.get("jobs", []):
                title = job.get("title", "")
                job_url = job.get("applyUrl", "") or job.get("jobUrl", "")
                location = job.get("location", "")
                department = job.get("department", "")
                description = job.get("description", "")  # HTML

                raw_text = _strip_html(description)
                if location:
                    raw_text = f"{location}\n\n{raw_text}"
                if department:
                    raw_text = f"[{department}]\n{raw_text}"

                candidates.append(
                    RawCandidate(
                        source=f"ashby:{company}",
                        title=title,
                        url=job_url,
                        snippet=raw_text[:500],
                        raw_text=raw_text[:2000],
                        company=company,
                        tier=5,
                        contact_path=extract_contact_path(
                            description, raw_text, apply_url=job_url
                        ),
                    )
                )
    except Exception:
        pass

    return candidates


# ── Helpers ──


def _strip_html(html: str) -> str:
    """Strip HTML tags, keeping text content."""
    import re

    # Remove tags
    text = re.sub(r"<[^>]+>", " ", html)
    # Decode common entities (ponytail: stdlib html.unescape would be cleaner,
    # but we avoid the import to keep things simple)
    text = (
        text.replace("&nbsp;", " ")
        .replace("&", "&")
        .replace("<", "<")
        .replace(">", ">")
        .replace("&quot;", '"')
        .replace("&#39;", "'")
    )
    # Collapse whitespace
    text = re.sub(r"\s+", " ", text).strip()
    return text


async def fetch_all_ats_jobs() -> list[RawCandidate]:
    """Fetch jobs from all configured ATS companies."""
    import asyncio

    companies = load_companies()
    tasks = []

    for company in companies.get("greenhouse", []):
        tasks.append(fetch_greenhouse_jobs(company))
    for company in companies.get("lever", []):
        tasks.append(fetch_lever_jobs(company))
    for company in companies.get("ashby", []):
        tasks.append(fetch_ashby_jobs(company))

    results = await asyncio.gather(*tasks, return_exceptions=True)

    all_candidates: list[RawCandidate] = []
    for result in results:
        if isinstance(result, Exception):
            continue
        all_candidates.extend(result)

    return all_candidates
