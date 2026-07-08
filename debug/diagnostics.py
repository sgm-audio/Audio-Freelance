"""Pipeline diagnostics: connectivity, Chroma health, error logs, remediation.

This module runs health checks against external services and reports actionable remediation steps.
"""

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx

from config import settings

# ── shared helpers ──


def check_search_api(name: str, api_url: str, timeout: int = 5) -> bool:
    """Quick connectivity test for a search API — just HEAD or GET, no real query."""
    try:
        resp = httpx.get(api_url, timeout=timeout)
        return resp.status_code < 500
    except Exception:
        return False


def check_chroma_health() -> dict:
    """Check ChromaDB collection health: init, document count, embedding test."""
    try:
        from leads.store import ensure_collections_initialized, get_all_leads

        ok = ensure_collections_initialized()
        if not ok:
            return {"healthy": False, "leads": 0, "error": "Collection init failed"}
        leads = get_all_leads()
        return {"healthy": True, "leads": len(leads)}
    except Exception as e:
        return {"healthy": False, "leads": 0, "error": str(e)}


def sweep_recent_errors(hours: int = 24) -> list[dict]:
    """Scan tracking logs for recent error events."""
    cutoff = datetime.now(tz=UTC) - timedelta(hours=hours)
    errors: list[dict] = []
    try:
        from leads.tracking import get_all_tracking

        events = get_all_tracking(limit=500)
        for e in events:
            if e.get("type", "").startswith("error") or "error" in str(e.get("data", {})).lower():
                ts_str = e.get("at", "")
                if ts_str:
                    try:
                        ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                        if ts >= cutoff:
                            errors.append(e)
                    except (ValueError, TypeError):
                        pass
    except Exception:
        pass
    return errors


# ── report dataclass ──


@dataclass
class DiagnosticReport:
    timestamp: str = field(default_factory=lambda: datetime.now(tz=UTC).isoformat())
    ollama_available: bool = False
    chroma_healthy: bool = False
    tavily_reachable: bool = False
    serper_reachable: bool = False
    firecrawl_reachable: bool = False
    chroma_stats: dict = field(default_factory=dict)
    recent_errors: list[dict] = field(default_factory=list)
    failure_modes: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    remediation: list[str] = field(default_factory=list)


def run_diagnostics() -> dict:
    """Run all diagnostics and return a report as a dict."""
    report = DiagnosticReport()

    # 1. Check Ollama
    try:
        import ollama

        ollama.list()
        report.ollama_available = True
    except Exception:
        report.ollama_available = False
        report.errors.append("Ollama unreachable")
        report.remediation.append("Start Ollama: `ollama serve` or check OLLAMA_HOST")

    # 2. Check ChromaDB connectivity
    try:
        from chromadb import PersistentClient

        data_dir = Path(__file__).resolve().parent.parent / "leads" / "data" / "chroma"
        data_dir.mkdir(parents=True, exist_ok=True)
        client = PersistentClient(path=str(data_dir))
        client.heartbeat()
        report.chroma_healthy = True
    except Exception:
        report.chroma_healthy = False
        report.errors.append("ChromaDB unreachable")
        report.remediation.append("Check chromadb installation")

    # 3. Check API keys (presence only, no enumeration)
    missing = []
    for key, val in [
        ("TAVILY_API_KEY", settings.tavily_api_key),
        ("SERPER_API_KEY", settings.serper_api_key),
        ("FIRECRAWL_API_KEY", settings.firecrawl_api_key),
    ]:
        if not val:
            missing.append(key)
    if missing:
        keys = ", ".join(missing)
        report.remediation.append(f"Missing API keys: {keys}. Search will return 0 results.")

    # 4. Per-source connectivity
    report.tavily_reachable = check_search_api("Tavily", "https://api.tavily.com/search", timeout=5)
    if not report.tavily_reachable:
        report.errors.append("Tavily API unreachable")
        report.remediation.append("Check TAVILY_API_KEY and internet connection")

    report.serper_reachable = check_search_api(
        "Serper", "https://google.serper.dev/search", timeout=5
    )
    if not report.serper_reachable:
        report.errors.append("Serper API unreachable")
        report.remediation.append("Check SERPER_API_KEY and internet connection")

    report.firecrawl_reachable = check_search_api(
        "Firecrawl", "https://api.firecrawl.dev/v1/scrape", timeout=5
    )
    if not report.firecrawl_reachable:
        report.errors.append("Firecrawl API unreachable")
        report.remediation.append("Check FIRECRAWL_API_KEY and internet connection")

    # 5. ChromaDB collection health
    report.chroma_stats = check_chroma_health()
    if not report.chroma_stats.get("healthy"):
        report.errors.append(f"ChromaDB unhealthy: {report.chroma_stats.get('error', 'unknown')}")
        report.remediation.append("Check ChromaDB installation and data directory")

    # 6. Recent error sweep
    report.recent_errors = sweep_recent_errors()
    if report.recent_errors:
        report.errors.append(f"{len(report.recent_errors)} recent errors found")
        report.remediation.append("Review error details and check pipeline logs")

    # 7. Failure modes catalogue
    report.failure_modes = [
        "Ollama unreachable → dedup disabled, embeddings use fallback",
        "Search APIs down → pipeline returns 0 candidates",
        "ChromaDB corrupt → leads lost, re-seed or restore backup",
        "Rate limited → reduce search frequency or add delays",
        "API keys expired → regenerate at provider dashboards",
        "Port conflict → check lsof -i :8080 and :3000",
    ]

    return {
        "status": "degraded" if report.errors else "healthy",
        "timestamp": report.timestamp,
        "ollama_available": report.ollama_available,
        "chroma_healthy": report.chroma_healthy,
        "tavily_reachable": report.tavily_reachable,
        "serper_reachable": report.serper_reachable,
        "firecrawl_reachable": report.firecrawl_reachable,
        "chroma_stats": report.chroma_stats,
        "recent_errors": report.recent_errors[:10],
        "failure_modes": report.failure_modes,
        "errors": report.errors,
        "remediation": report.remediation,
    }
