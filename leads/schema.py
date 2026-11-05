"""Pydantic models for leads, candidates, and statuses.

Loads configurable values from .env with sensible defaults.
"""

import re
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from config import settings

PREFERRED_NICHES: list[str] = settings.as_niche_list() + settings.as_automation_niche_list()


_MAILTO_RE = re.compile(r"mailto:([^\s\"'<>?]+)", re.IGNORECASE)
_EMAIL_RE = re.compile(r"(?<![/\w.-])([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\b")
_EMAIL_SKIP_SUBSTR = (
    "example.com",
    "sentry.io",
    "wixpress",
    "schema.org",
    "godaddy",
    "2x.png",
    ".png",
    ".jpg",
    ".gif",
    ".svg",
)


def extract_email(*parts: str | None) -> str | None:
    """Extract a clean email address (without mailto: prefix) from text parts."""
    for part in parts:
        if not part:
            continue
        m = _MAILTO_RE.search(part)
        if m:
            candidate = m.group(1).rstrip(".,;").strip()
            if "@" in candidate and not any(s in candidate.lower() for s in _EMAIL_SKIP_SUBSTR):
                return candidate
        for em in _EMAIL_RE.finditer(part):
            email = em.group(1).rstrip(".,;").strip()
            if any(s in email.lower() for s in _EMAIL_SKIP_SUBSTR):
                continue
            return email
    return None


def infer_channel(
    url: str = "",
    source: str = "",
    contact_email: str | None = None,
    contact_path: str | None = None,
) -> str:
    """Infer outreach channel: 'email' | 'reddit' | 'discord' | 'upwork' | 'web'."""
    has_path_email = bool(
        contact_path and ("@" in contact_path or contact_path.lower().startswith("mailto:"))
    )
    if contact_email or has_path_email:
        return "email"
    u = (url or "").lower()

    s = (source or "").lower()
    if "reddit.com" in u or "reddit" in s:
        return "reddit"
    if "discord" in u or "discord" in s:
        return "discord"
    if "upwork.com" in u or "upwork" in s:
        return "upwork"
    return "web"


class LeadStatus(StrEnum):
    NEW = "NEW"
    SCORED = "SCORED"
    HOT = "HOT"
    WARM = "WARM"
    COLD = "COLD"
    SKIPPED = "SKIPPED"
    DRAFT_READY = "DRAFT_READY"
    APPROVED = "APPROVED"
    SENT = "SENT"
    CONTACTED = "CONTACTED"
    FOLLOW_UP_1_DUE = "FOLLOW_UP_1_DUE"
    FOLLOW_UP_1_SENT = "FOLLOW_UP_1_SENT"
    REPLIED = "REPLIED"
    PROPOSAL_SENT = "PROPOSAL_SENT"
    WON = "WON"
    LOST = "LOST"
    ARCHIVED = "ARCHIVED"
    DEAD = "DEAD"


Verdict = Literal["HOT", "WARM", "COLD", "SKIP"]
OutreachChannel = Literal["email", "reddit", "discord", "upwork", "web"]


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
    contact_email: str | None = None
    channel: str | None = None
    sent_at: datetime | None = None
    next_follow_up_at: datetime | None = None
    follow_up_count: int = 0
    last_message_id: str | None = None
    last_subject: str | None = None
    last_asset_id: str | None = None
    discovered_at: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))
    last_updated: datetime = Field(default_factory=lambda: datetime.now(tz=UTC))
    notes: str | None = None

    def model_post_init(self, __context: object) -> None:
        if not self.contact_email:
            self.contact_email = extract_email(self.contact_path, self.raw_text, self.title)
        if not self.channel:
            self.channel = infer_channel(
                url=self.url,
                source=self.source,
                contact_email=self.contact_email,
                contact_path=self.contact_path,
            )

    @field_validator("niche")
    @classmethod
    def validate_niche(cls, v: str) -> str:
        if not v or not re.match(r"^[a-zA-Z0-9_\-]+$", v):
            raise ValueError(
                "Niche must be non-empty and contain only letters, numbers, "
                f"underscore, and hyphen (got: '{v}')"
            )
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
    contact_path: str | None = None

    def __post_init__(self):
        if not self.raw_text:
            self.raw_text = self.snippet
        if self.tier < 1:
            self.tier = 1
        elif self.tier > 5:
            self.tier = 5
