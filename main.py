#!/usr/bin/env python3
"""FastAPI entry point — serves dashboard + API + briefing dispatch."""

import time
import uuid
from datetime import UTC, datetime
from pathlib import Path
from string import Template

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from api.metrics import api_request_duration, api_requests
from api.routes import public, router
from config import settings
from debug.log import get_logger, set_correlation_id, setup_logging

setup_logging(log_level=settings.log_level)

# ── Startup warning ──
_api_key = settings.api_key
if not _api_key:
    log = get_logger("main")
    log.warning(
        "api_key_not_set",
        detail="ALL API endpoints are unprotected. Set API_KEY in .env.",
    )

# ── Auto-rotate cold leads on startup (laptop-friendly, no cron needed) ──
try:
    from leads.store import auto_rotate_if_needed

    rotation_days = settings.cold_rotation_days
    result = auto_rotate_if_needed(age_days=rotation_days)
    if result is not None:
        archived, deleted = result
        log = get_logger("main")
        log.info("auto_rotate_cold_leads", archived=archived, deleted=deleted)
except Exception:
    log = get_logger("main")
    log.warning("auto_rotate_failed", detail="best-effort, continuing")

# ── Rate limiter ──
limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])

# ── CORS origins ──
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:8080",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:8080",
]

# Allow overriding via env var (comma-separated)
extra_list = settings.as_cors_list()
if extra_list:
    ALLOWED_ORIGINS.extend(extra_list)

# ── Sentry error tracking ──
if settings.sentry_dsn:
    import sentry_sdk

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.environment,
        traces_sample_rate=1.0 if settings.environment == "development" else 0.1,
        profiles_sample_rate=0.1,
    )

app = FastAPI(
    title="Audio-Dev Freelance Acquisition System",
    description=(
        "Automated multi-tier lead sourcing, scoring, outreach, and market intelligence pipeline."
    ),
    version="0.1.2",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Correlation ID middleware (must come before request logging) ──


@app.middleware("http")
async def correlation_id_middleware(request: Request, call_next):
    """Attach a unique correlation ID to every request."""
    cid = request.headers.get("X-Correlation-ID", str(uuid.uuid4())[:8])
    set_correlation_id(cid)
    response = await call_next(request)
    response.headers["X-Correlation-ID"] = cid
    return response


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log every HTTP request with method, path, status, and duration."""
    log = get_logger("api")
    start = time.perf_counter()
    response = await call_next(request)
    duration = time.perf_counter() - start

    path = request.url.path
    if path.startswith("/api/"):
        log.info(
            "request",
            method=request.method,
            path=path,
            status=response.status_code,
            duration=round(duration, 3),
        )

        api_requests.labels(method=request.method, path=path).inc()
        api_request_duration.labels(method=request.method).observe(duration)

    return response


@app.middleware("http")
async def auth_warning_middleware(request: Request, call_next):
    """Add auth-disabled warning headers and basic security headers."""
    response = await call_next(request)

    if not _api_key:
        response.headers["X-Auth-Status"] = "disabled"
        if request.url.path.startswith("/api/"):
            response.headers["X-Auth-Warning"] = "API_KEY not configured — endpoints unprotected"

    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"

    return response


app.include_router(public, prefix="/api/v1")
app.include_router(router, prefix="/api/v1")


# ── Daily Briefing HTML page ──


@app.get("/briefing", response_class=HTMLResponse)
async def daily_briefing():
    """Rendered HTML daily briefing: lead counts, pipeline status, quick actions."""
    from leads.schema import LeadStatus
    from leads.store import check_ollama_available, get_all_leads

    leads = get_all_leads()
    counts: dict[str, int] = {}
    for s in LeadStatus:
        counts[s.value] = sum(1 for lead in leads if lead.status == s)

    total = len(leads)
    hot = counts.get("HOT", 0)
    warm = counts.get("WARM", 0)
    cold = counts.get("COLD", 0)
    contacted = counts.get("CONTACTED", 0)
    won = counts.get("WON", 0)

    ollama_ok = check_ollama_available()
    now = datetime.now(tz=UTC).strftime("%Y-%m-%d %H:%M UTC")

    template_path = Path(__file__).resolve().parent / "templates" / "briefing.html"
    html = Template(template_path.read_text()).substitute(
        total=total,
        hot=hot,
        warm=warm,
        cold=cold,
        contacted=contacted,
        won=won,
        now=now,
        ollama_class="green" if ollama_ok else "red",
        ollama_status="reachable" if ollama_ok else "unreachable",
    )

    return HTMLResponse(content=html, media_type="text/html")


# ── Startup ──

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        log_level="info",
        reload=False,
    )
