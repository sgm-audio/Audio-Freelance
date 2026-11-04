"""Centralized configuration via pydantic-settings.

Single source of truth for all environment variables.
Crashes immediately on startup if required keys are missing.
Import `settings` from this module everywhere.
"""

from __future__ import annotations

import contextlib
import os
from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parent

SEARCH_KEYS = ("tavily_api_key", "serper_api_key", "firecrawl_api_key")
SEARCH_KEYS_UPPER = {k.upper() for k in SEARCH_KEYS}


def reload_settings(env_path: Path | None = None) -> Settings:
    """Re-instantiate `settings` from `.env` so newly written keys take effect
    without restarting the server. Safe to call after `write_search_keys`.

    `env_path` overrides the default `.env` location (used by tests for
    isolation).
    """
    global settings
    settings = Settings(_env_file=env_path or (ROOT / ".env"))
    return settings


def write_search_keys(
    keys: dict[str, str], env_path: Path | None = None
) -> None:
    """Persist search API keys to `.env`, preserving all other lines/comments.

    Only provided, non-empty keys are written. Search keys are stored UPPERCASE
    in `.env` (pydantic reads them case-insensitively). After writing, `settings`
    is reloaded so the new keys take effect live. Refuses to run when
    ENVIRONMENT=production (fail-closed: secrets must never be written via UI
    in production).

    `env_path` overrides the default `.env` location (used by tests for
    isolation).
    """
    if settings.environment.strip().lower() == "production":
        raise PermissionError("Cannot write search keys when ENVIRONMENT=production")

    target = env_path or (ROOT / ".env")
    lines = target.read_text(encoding="utf-8").splitlines() if target.is_file() else []
    # .env keys are UPPERCASE; pydantic field names are lowercase. Normalize on
    # write so lookups match regardless of case.
    upper = {k.upper(): v for k, v in keys.items() if v}
    written: set[str] = set()
    out: list[str] = []
    for line in lines:
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in stripped:
            raw_k, _, raw_v = line.partition("=")
            k = raw_k.strip().upper()
            v = raw_v.strip()
            if k in SEARCH_KEYS_UPPER:
                # Normalise search keys to UPPERCASE; apply new value if provided.
                out.append(f"{k}={upper.get(k, v)}")
                if k in upper:
                    written.add(k)
                continue
        out.append(line)
    for k, v in upper.items():
        if k not in written:
            out.append(f"{k}={v}")
    # Dedupe: keep the LAST occurrence of each search key so stray duplicates
    # (e.g. from a previous case-mismatched write) collapse to a single line.
    seen: set[str] = set()
    deduped: list[str] = []
    for line in reversed(out):
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in stripped:
            k = line.partition("=")[0].strip().upper()
            if k in SEARCH_KEYS_UPPER:
                if k in seen:
                    continue
                seen.add(k)
        deduped.append(line)
    deduped.reverse()
    target.write_text("\n".join(deduped) + "\n", encoding="utf-8")
    with contextlib.suppress(OSError):
        os.chmod(target, 0o600)
    reload_settings(env_path=target)


class Settings(BaseSettings):
    """All configuration for the Audio-Freelance system.

    Search API keys are optional with empty defaults. Leaving them unset degrades
    Prospect/web search but does not block boot: ATS lists, manual lead import,
    scoring, outreach drafts, and tracking all work without them.
    """

    model_config = SettingsConfigDict(
        env_file=ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── Optional search API keys ──
    # Unset keys disable web search for the corresponding provider only;
    # this is the deliberate local-first default.
    tavily_api_key: str = ""
    serper_api_key: str = ""
    firecrawl_api_key: str = ""

    # ── Optional auth ──
    api_key: str = ""

    # ── Optional API tokens ──
    github_token: str = ""

    # ── Ollama ──
    ollama_host: str = "http://localhost:11434"

    # ── ChromaDB ──
    chroma_collection_leads: str = "freelance_leads"
    chroma_collection_outreach: str = "freelance_outreach_log"
    embedding_model: str = "nomic-embed-text"
    dedup_similarity_threshold: float = 0.92
    leads_data_dir: str = ""
    leads_archive_dir: str = ""
    leads_tracking_dir: str = ""
    leads_allow_test_leads: bool = False

    # ── Niches ──
    preferred_niches: str = "plugin_dev,reaper_scripts,rust_audio,audio_ml,game_audio_dev"
    user_type: str = "audio"  # audio | automation | custom
    automation_niches: str = (
        "n8n_automation,zapier_make,api_integration,business_automation,ai_automation"
    )

    # ── Rate floors ──
    min_rate_cad: int = 3000
    hourly_floor_cad: int = 150

    # ── Scoring ──
    hot_threshold: int = 10
    warm_threshold: int = 5

    # ── Cold rotation ──
    cold_rotation_days: int = 3

    # ── CORS ──
    cors_origins: str = ""

    # ── Sentry ──
    sentry_dsn: str = ""
    environment: str = "development"

    # ── Server ──
    host: str = "127.0.0.1"
    port: int = 8080
    log_level: str = "INFO"

    # ── Profile ──
    profile_path: str = ""

    # ── Paths ──
    companies_path: str = ""

    def missing_search_keys(self) -> list[str]:
        """Return the names of configured-but-empty search providers."""
        return [key for key in SEARCH_KEYS if not getattr(self, key)]

    @model_validator(mode="after")
    def require_production_auth(self) -> Settings:
        """Fail closed when a production deployment omits API authentication."""
        if self.environment.strip().lower() == "production" and not self.api_key:
            raise ValueError("API_KEY is required when ENVIRONMENT=production")
        return self

    def as_niche_list(self) -> list[str]:
        """Return preferred_niches as a list."""
        return [n.strip() for n in self.preferred_niches.split(",") if n.strip()]

    def as_cors_list(self) -> list[str]:
        """Return CORS origins as a list."""
        if not self.cors_origins:
            return []
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    def as_automation_niche_list(self) -> list[str]:
        """Return automation_niches as a list."""
        return [n.strip() for n in self.automation_niches.split(",") if n.strip()]


# Singleton — crashes at import time if tavily_api_key etc are missing
settings = Settings()  # type: ignore[call-arg]  # pydantic-settings loads from .env
