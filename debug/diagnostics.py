"""Pipeline diagnostics: per-source connectivity, Chroma health, error logs, failure-mode remediation."""

import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


@dataclass
class DiagnosticReport:
    timestamp: str = field(
        default_factory=lambda: datetime.now(tz=timezone.utc).isoformat()
    )
    ollama_available: bool = False
    chroma_healthy: bool = False
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
    except Exception as e:
        report.ollama_available = False
        report.errors.append("Ollama unreachable")
        report.remediation.append("Start Ollama: `ollama serve` or check OLLAMA_HOST")

    # 2. Check ChromaDB
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

    # 3. Check API keys (present only, no enumeration)
    missing = []
    for key in ["TAVILY_API_KEY", "SERPER_API_KEY", "FIRECRAWL_API_KEY"]:
        if not os.getenv(key, ""):
            missing.append(key)
    if missing:
        report.remediation.append(f"Missing API keys: {', '.join(missing)}. Search will return 0 results.")

    return {
        "status": "degraded" if report.errors else "healthy",
        "timestamp": report.timestamp,
        "ollama_available": report.ollama_available,
        "chroma_healthy": report.chroma_healthy,
        "errors": report.errors,
        "remediation": report.remediation,
    }
