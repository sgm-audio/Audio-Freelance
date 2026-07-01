"""Deep fetch: retrieve full job descriptions from URLs.

This is the "dig deeper" layer. After search returns candidates with short
snippets, we fetch the actual page and extract the main content. This turns
"View job" snippets into full job descriptions that can be scored properly.

Uses httpx for fetching and a simple HTML-to-text extractor (no external
dependency on trafilatura to keep the install lean).
"""

import re
from html.parser import HTMLParser

import httpx


# ── URL quality filter ──


# Patterns that indicate aggregator/search pages, not individual jobs
_AGGREGATOR_URL_PATTERNS = [
    r"linkedin\.com/jobs/search",
    r"linkedin\.com/jobs/(?!view/)",  # /jobs/anything except /jobs/view/
    r"indeed\.com/jobs\?",
    r"indeed\.com/jobs(?!\.html)",  # not a specific job page
    r"remoteok\.com/hire-remotely",
    r"weworkremotely\.com/\d{4}-",  # year-based listicles
    r"ycombinator\.com/companies(?!/.*/jobs)",  # company pages, not jobs
    r"reddit\.com/r/",  # reddit threads
    r"google\.com/search",
]

# Patterns that indicate individual job postings
_JOB_URL_PATTERNS = [
    r"linkedin\.com/jobs/view/",
    r"indeed\.com/pagead/",
    r"indeed\.com/viewjob\?",
    r"boards\.greenhouse\.io/.*/jobs/",
    r"jobs\.lever\.co/.*/",
    r"jobs\.ashbyhq\.com/.*/",
    r"remoteok\.com/remote-jobs/\d+",
    r"weworkremotely\.com/remote-jobs/",
    r"wellfound\.com/jobs/",
]


def is_aggregator_url(url: str) -> bool:
    """True if URL is an aggregator/search page, not an individual job."""
    for pat in _AGGREGATOR_URL_PATTERNS:
        if re.search(pat, url, re.IGNORECASE):
            return True
    return False


def is_job_url(url: str) -> bool:
    """True if URL looks like an individual job posting."""
    for pat in _JOB_URL_PATTERNS:
        if re.search(pat, url, re.IGNORECASE):
            return True
    return False


# ── Simple HTML-to-text extractor ──


class _TextExtractor(HTMLParser):
    """Extract visible text from HTML, skipping scripts/styles."""

    def __init__(self):
        super().__init__()
        self._text_parts: list[str] = []
        self._skip = False

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript"):
            self._skip = True

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript"):
            self._skip = False
        if tag in ("p", "br", "div", "li", "h1", "h2", "h3", "h4", "h5", "h6"):
            self._text_parts.append("\n")

    def handle_data(self, data):
        if not self._skip:
            self._text_parts.append(data)

    def get_text(self) -> str:
        text = "".join(self._text_parts)
        # Collapse whitespace
        text = re.sub(r"[ \t]+", " ", text)
        text = re.sub(r"\n\s*\n+", "\n\n", text)
        return text.strip()


def html_to_text(html: str) -> str:
    """Extract visible text from HTML."""
    parser = _TextExtractor()
    try:
        parser.feed(html)
    except Exception:
        return ""
    return parser.get_text()


# ── Main fetch function ──


async def fetch_and_extract(url: str, timeout: int = 10) -> str | None:
    """Fetch a URL and return extracted text content.

    Returns None on failure (timeout, 403, block page, etc.).
    """
    if is_aggregator_url(url):
        return None

    try:
        async with httpx.AsyncClient(
            timeout=timeout,
            follow_redirects=True,
            headers={"User-Agent": "Mozilla/5.0 (compatible; AudioFreelanceBot/1.0)"},
        ) as client:
            resp = await client.get(url)
            resp.raise_for_status()

            # Check for block pages
            text_lower = resp.text.lower()
            block_signatures = [
                "captcha",
                "cloudflare",
                "please enable javascript",
                "verify you are human",
                "access denied",
            ]
            if any(sig in text_lower for sig in block_signatures):
                return None

            return html_to_text(resp.text)
    except Exception:
        return None


def extract_job_signals(text: str) -> dict:
    """Extract structured signals from job posting text.

    Returns dict with: title, company, location, rate, requirements, description.
    """
    result = {
        "title": "",
        "company": "",
        "location": "",
        "rate": "",
        "requirements": [],
        "description": "",
    }

    # Try to find title (usually in <h1> or first line)
    lines = [line.strip() for line in text.split("\n") if line.strip()]
    if lines:
        result["title"] = lines[0][:200]

    # Look for rate/budget mentions
    rate_patterns = [
        r"\$\s*(\d+)\s*k",
        r"\$\s*(\d{3,5})",
        r"(\d+)\s*k\s*(?:budget|contract)",
    ]
    for pat in rate_patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            result["rate"] = m.group(0)
            break

    # Look for location
    location_patterns = [
        r"(?:location|based in|remote)[:\s]+([^\n,]+(?:,\s*[A-Z]{2})?)",
        r"\b(remote|hybrid|on-site)\b",
    ]
    for pat in location_patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            result["location"] = m.group(1).strip()[:100]
            break

    return result
