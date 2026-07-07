"""Pydantic models for leads, candidates, and statuses.

Loads configurable values from .env with sensible defaults.
"""

import os
import re
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from enum import StrEnum
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from pydantic import BaseModel, Field, field_validator

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


def _parse_niches(raw: str | None) -> list[str]:
    if not raw:
        return [
            "plugin_dev",
            "reaper_scripts",
            "rust_audio",
            "audio_ml",
            "game_audio_dev",
        ]
    return [n.strip() for n in raw.split(",") if n.strip()]


PREFERRED_NICHES: list[str] = _parse_niches(os.getenv("PREFERRED_NICHES"))


class LeadStatus(StrEnum):
    NEW = "NEW"
    SCORED = "SCORED"
    HOT = "HOT"
    WARM = "WARM"
    COLD = "COLD"
    SKIPPED = "SKIPPED"
    CONTACTED = "CONTACTED"
    REPLIED = "REPLIED"
    PROPOSAL_SENT = "PROPOSAL_SENT"
    WON = "WON"
    LOST = "LOST"
    DEAD = "DEAD"


Verdict = Literal["HOT", "WARM", "COLD", "SKIP"]


class Lead(BaseModel):
    model_config = {"use_enum_values": False}

    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    source: str
    tier: int = Field(ge=1, le=5)
    title: str
    company: str | None = None
    url: str
    raw_text: str
    niche: str
    signals: dict[str, int] = Field(default_factory=dict)
    score: int = 0
    verdict: Verdict = "COLD"
    status: LeadStatus = LeadStatus.NEW
    contact_path: str | None = None
    discovered_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))
    last_updated: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))
    notes: str | None = None

    @field_validator("niche")
    @classmethod
    def validate_niche(cls, v: str) -> str:
        if v not in PREFERRED_NICHES:
            raise ValueError(f"Unknown niche '{v}'. Must be one of: {', '.join(PREFERRED_NICHES)}")
        return v

    @field_validator("url")
    @classmethod
    def url_must_be_valid(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("url must not be empty")
        if not re.match(r"^https?://", v):
            raise ValueError(f"url must start with http:// or https:// (got: {v[:60]})")
        return v

    @field_validator("tier")
    @classmethod
    def tier_must_be_1_to_5(cls, v: int) -> int:
        if v < 1 or v > 5:
            raise ValueError(f"tier must be 1-5, got {v}")
        return v


@dataclass
class RawCandidate:
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
        if self.tier < 1:
            self.tier = 1
        elif self.tier > 5:
            self.tier = 5
