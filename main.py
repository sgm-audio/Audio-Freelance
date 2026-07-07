#!/usr/bin/env python3
"""FastAPI entry point — serves dashboard + API + briefing dispatch."""

import logging
import os
import time
from datetime import UTC, datetime
from pathlib import Path
from string import Template

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from api.routes import public, router

# Load .env before anything else
env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(env_path)

# ── Startup warning ──
_api_key = os.getenv("API_KEY", "")
if not _api_key:
    logger = logging.getLogger("uvicorn")
    logger.warning(
        "=" * 60 + "\n"
        "⚠  API_KEY not set — ALL API endpoints are unprotected.\n"
        "   Set API_KEY in .env for production deployments.\n"
        "   Response header X-Auth-Status: disabled added to every request.\n" + "=" * 60
    )

# ── Auto-rotate cold leads on startup (laptop-friendly, no cron needed) ──
try:
    from leads.store import auto_rotate_if_needed

    rotation_days = int(os.getenv("COLD_ROTATION_DAYS", "3"))
    result = auto_rotate_if_needed(age_days=rotation_days)
    if result is not None:
        archived, deleted = result
        logging.getLogger("uvicorn").info(
            f"Auto-rotated cold leads: {archived} archived, {deleted} deleted."
        )
except Exception:
    pass  # Rotation is best-effort — never block startup

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
extra = os.getenv("CORS_ORIGINS", "")
if extra:
    ALLOWED_ORIGINS.extend([o.strip() for o in extra.split(",") if o.strip()])

app = FastAPI(
    title="Audio-Dev Freelance Acquisition System",
    description=(
        "Automated multi-tier lead sourcing, scoring, outreach, and market intelligence pipeline."
    ),
    version="0.1.1",
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


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    duration = time.perf_counter() - start

    path = request.url.path
    if path.startswith("/api/"):
        status = response.status_code
        method = request.method
        if status < 300:
            level = "INFO"
        elif status < 500:
            level = "WARNING"
        else:
            level = "ERROR"

        logger = logging.getLogger("uvicorn")
        logger.log(
            logging.getLevelName(level),
            f"{method} {path} → {status} ({duration:.3f}s)",
        )

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
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", "8080")),
        log_level="info",
        reload=False,
    )
