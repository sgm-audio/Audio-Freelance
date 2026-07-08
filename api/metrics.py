"""Prometheus metrics for the Audio-Freelance system."""

from __future__ import annotations

from prometheus_client import REGISTRY, Counter, Gauge, Histogram, generate_latest

# ── Pipeline metrics ──
pipeline_runs = Counter(
    "audiofreelance_pipeline_runs_total",
    "Total pipeline prospecting runs",
    ["niche"],
)

leads_discovered = Counter(
    "audiofreelance_leads_discovered_total",
    "Total leads discovered by verdict",
    ["verdict"],
)

# ── API metrics ──
api_requests = Counter(
    "audiofreelance_api_requests_total",
    "Total API requests",
    ["method", "path"],
)

api_request_duration = Histogram(
    "audiofreelance_api_request_duration_seconds",
    "API request duration in seconds",
    ["method"],
    buckets=[0.01, 0.05, 0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0],
)

# ── Search metrics ──
search_api_errors = Counter(
    "audiofreelance_search_api_errors_total",
    "Search API errors by provider",
    ["provider"],
)

# ── Storage metrics ──
leads_stored = Gauge(
    "audiofreelance_leads_stored_total",
    "Current number of leads in ChromaDB",
)

ollama_available = Gauge(
    "audiofreelance_ollama_available",
    "Whether Ollama is reachable (1=yes, 0=no)",
)


def metrics_response() -> bytes:
    """Return Prometheus text format metrics."""
    return generate_latest(REGISTRY)
