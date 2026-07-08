"""Centralized configuration via pydantic-settings.

Single source of truth for all environment variables.
Crashes immediately on startup if required keys are missing.
Import `settings` from this module everywhere.
"""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All configuration for the Audio-Freelance system."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── Required API keys ──
    tavily_api_key: str
    serper_api_key: str
    firecrawl_api_key: str

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

    def as_niche_list(self) -> list[str]:
        """Return preferred_niches as a list."""
        return [n.strip() for n in self.preferred_niches.split(",") if n.strip()]

    def as_cors_list(self) -> list[str]:
        """Return CORS origins as a list."""
        if not self.cors_origins:
            return []
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


# Singleton — crashes at import time if tavily_api_key etc are missing
settings = Settings()
