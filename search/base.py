"""Shared search utilities with Tavily → Serper → Firecrawl fallback chain."""

from dataclasses import dataclass

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from config import settings


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
