"""Shared search utilities with Tavily → Serper → Firecrawl fallback chain."""

import re
from dataclasses import dataclass

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from config import settings

_MAILTO_RE = re.compile(r"mailto:([^\s\"'<>?]+)", re.IGNORECASE)
_EMAIL_RE = re.compile(
    r"(?<![/\w.-])([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\b"
)
# Skip noise emails from CDNs, trackers, placeholders
_EMAIL_SKIP_SUBSTR = (
    "example.com",
    "sentry.io",
    "wixpress",
    "schema.org",
    "godaddy",
    "2x.png",
    ".png",
    ".jpg",
    ".gif",
    ".svg",
)


def extract_contact_path(*parts: str, apply_url: str | None = None) -> str | None:
    """Best-effort contact path: mailto/email from text, else ATS apply URL."""
    for part in parts:
        if not part:
            continue
        m = _MAILTO_RE.search(part)
        if m:
            return f"mailto:{m.group(1).rstrip('.,;')}"
        for em in _EMAIL_RE.finditer(part):
            email = em.group(1).rstrip(".,;")
            low = email.lower()
            if any(s in low for s in _EMAIL_SKIP_SUBSTR):
                continue
            return email
    if apply_url:
        url = apply_url.strip()
        if url.startswith("http://") or url.startswith("https://"):
            return url
    return None


@dataclass
class SearchResult:
    """A raw search hit from any source."""

    title: str
    url: str
    snippet: str
    source_api: str = ""


@dataclass
class RawCandidate:
    """Lightweight raw search result before scoring/dedup."""

    source: str
    title: str
    url: str
    snippet: str
    company: str | None = None
    raw_text: str = ""
    tier: int = 1
    contact_path: str | None = None

    def __post_init__(self):
        if not self.raw_text:
            self.raw_text = self.snippet


_BLOCK_SIGNATURES = [
    "captcha",
    "cf-error",
    "cloudflare",
    "enable javascript",
    "verify you are human",
    "please turn javascript on",
    "automated access",
]

_TAVILY_API_KEY = settings.tavily_api_key
_SERPER_API_KEY = settings.serper_api_key
_FIRECRAWL_API_KEY = settings.firecrawl_api_key


def _is_key_valid(key: str, min_len: int = 20) -> bool:
    """Heuristic: key must exist, not be a stub/placeholder, and have reasonable length."""
    if not key or len(key) < min_len:
        return False
    # Catch obvious placeholders like "your-key-here"
    lower = key.lower()
    if lower in ("", "your_key", "your-key", "placeholder", "***", "none"):
        return False
    # Catch repeated characters used as fillers
    unique = len(set(key))
    return not unique < 5


_TAVILY_URL = "https://api.tavily.com/search"
_SERPER_URL = "https://google.serper.dev/search"
_FIRECRAWL_SEARCH_URL = "https://api.firecrawl.dev/v1/search"


def is_block_page(text: str) -> bool:
    """Check if a response body indicates a bot block / CAPTCHA."""
    lower = text.lower()
    return any(sig in lower for sig in _BLOCK_SIGNATURES)


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=10),
)
async def _tavily_search(query: str, max_results: int = 10) -> list[SearchResult]:
    """Search via Tavily API."""
    if not _is_key_valid(_TAVILY_API_KEY, min_len=20):
        return []

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                _TAVILY_URL,
                json={
                    "api_key": _TAVILY_API_KEY,
                    "query": query,
                    "max_results": max_results,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            results = []
            for r in data.get("results", []):
                results.append(
                    SearchResult(
                        title=r.get("title", ""),
                        url=r.get("url", ""),
                        snippet=r.get("content", ""),
                        source_api="tavily",
                    )
                )
            return results
    except Exception:
        return []


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=10),
)
async def _serper_search(query: str, max_results: int = 10) -> list[SearchResult]:
    """Search via Serper (Google) API."""
    if not _is_key_valid(_SERPER_API_KEY, min_len=20):
        return []

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                _SERPER_URL,
                json={"q": query, "num": max_results},
                headers={"X-API-KEY": _SERPER_API_KEY},
            )
            resp.raise_for_status()
            data = resp.json()
            results = []
            for r in data.get("organic", []):
                results.append(
                    SearchResult(
                        title=r.get("title", ""),
                        url=r.get("link", ""),
                        snippet=r.get("snippet", ""),
                        source_api="serper",
                    )
                )
            return results
    except Exception:
        return []


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=10),
)
async def _firecrawl_search(query: str, max_results: int = 10) -> list[SearchResult]:
    """Search via Firecrawl API."""
    if not _is_key_valid(_FIRECRAWL_API_KEY, min_len=20):
        return []

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                _FIRECRAWL_SEARCH_URL,
                json={"query": query, "limit": max_results},
                headers={"Authorization": f"Bearer {_FIRECRAWL_API_KEY}"},
            )
            resp.raise_for_status()
            data = resp.json()
            results = []
            for r in data.get("results", []):
                results.append(
                    SearchResult(
                        title=r.get("title", ""),
                        url=r.get("url", ""),
                        snippet=r.get("description", ""),
                        source_api="firecrawl",
                    )
                )
            return results
    except Exception:
        return []


async def web_search(query: str, max_results: int = 10) -> list[SearchResult]:
    """Multi-API search with fallback chain: Tavily → Serper → Firecrawl."""
    # Try Tavily first
    results = await _tavily_search(query, max_results)
    if results:
        return results

    # Fallback to Serper
    results = await _serper_search(query, max_results)
    if results:
        return results

    # Final fallback to Firecrawl
    results = await _firecrawl_search(query, max_results)
    return results


async def fetch_url(url: str, timeout: int = 15) -> str | None:
    """Fetch a URL and return its text content (or None on failure)."""
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
            resp.raise_for_status()
            text = resp.text
            if is_block_page(text):
                return None
            return text
    except Exception:
        return None
