#!/usr/bin/env python3
"""FastAPI entry point — serves dashboard + API + briefing dispatch."""

import os
from datetime import datetime, timezone
from pathlib import Path

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# Load .env before anything else
env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(env_path)

from api.routes import router, public

# ── Startup checks ──
_api_key = os.getenv("API_KEY", "")
if not _api_key:
    import warnings
    warnings.warn(
        "⚠ API_KEY not set. All API endpoints are unprotected. "
        "Set API_KEY in .env for production deployments."
    )

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
    description="Automated multi-tier lead sourcing, scoring, outreach, and market intelligence pipeline.",
    version="0.1.0",
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

app.include_router(public, prefix="/api/v1")
app.include_router(router, prefix="/api/v1")
