"""User profile loader and validator.

The profile is stored in profile.yaml at the project root. All fields are
optional — the system works with a minimal profile and gets better as the
user adds information.

Inclusive design: empty fields mean "no filter", not "missing data".
"""

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

# ── Profile data class ──


@dataclass
class Profile:
    """User's freelance profile. All fields optional."""

    # Identity
    name: str = ""
    location: str = ""
    timezone: str = ""
    remote_ok: bool = True
    relocation_ok: bool = False

    # Skills
    languages: list[str] = field(default_factory=list)
    frameworks: list[str] = field(default_factory=list)
    domains: list[str] = field(default_factory=list)
    specializations: list[str] = field(default_factory=list)

    # Preferences
    niches: list[str] = field(default_factory=list)
    excluded_niches: list[str] = field(default_factory=list)
    dealbreakers: list[str] = field(default_factory=list)
    rate_floor: int = 0
    hourly_floor: int = 0
    contract_types: list[str] = field(default_factory=list)

    # Experience
    years: int | None = None
    seniority: list[str] = field(default_factory=list)

    # Blocked companies (suppress all leads from these)
    blocked_companies: list[str] = field(default_factory=list)

    # Portfolio (all optional — system doesn't require these)
    github: str = ""
    website: str = ""
    notable_work: list[str] = field(default_factory=list)

    def is_empty(self) -> bool:
        """True if no meaningful profile data has been set."""
        return (
            not self.name
            and not self.languages
            and not self.frameworks
            and not self.domains
            and not self.niches
            and not self.dealbreakers
            and self.rate_floor == 0
            and self.hourly_floor == 0
            and not self.seniority
        )

    def completeness(self) -> int:
        """Return a 0-100 score indicating how complete the profile is."""
        fields_to_check = [
            bool(self.name),
            bool(self.location),
            bool(self.languages),
            bool(self.frameworks),
            bool(self.domains),
            bool(self.niches),
            bool(self.dealbreakers),
            self.rate_floor > 0,
            bool(self.seniority),
            bool(self.github or self.website or self.notable_work),
        ]
        return sum(fields_to_check) * 10

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dict for API responses."""
        return {
            "identity": {
                "name": self.name,
                "location": self.location,
                "timezone": self.timezone,
                "remote_ok": self.remote_ok,
                "relocation_ok": self.relocation_ok,
            },
            "skills": {
                "languages": self.languages,
                "frameworks": self.frameworks,
                "domains": self.domains,
                "specializations": self.specializations,
            },
            "preferences": {
                "niches": self.niches,
                "excluded_niches": self.excluded_niches,
                "dealbreakers": self.dealbreakers,
                "blocked_companies": self.blocked_companies,
                "rate_floor": self.rate_floor,
                "hourly_floor": self.hourly_floor,
                "contract_types": self.contract_types,
            },
            "experience": {
                "years": self.years,
                "seniority": self.seniority,
            },
            "portfolio": {
                "github": self.github,
                "website": self.website,
                "notable_work": self.notable_work,
            },
            "completeness": self.completeness(),
            "is_empty": self.is_empty(),
        }


# ── Loader ──


def get_profile_path() -> Path:
    """Return the path to profile.yaml."""
    return Path(
        os.getenv(
            "PROFILE_PATH", Path(__file__).resolve().parent.parent / "profile.yaml"
        )
    )


def profile_exists() -> bool:
    """Check if a profile.yaml exists."""
    return get_profile_path().exists()


def load_profile() -> Profile:
    """Load profile from profile.yaml. Returns empty Profile if file missing."""
    path = get_profile_path()
    if not path.exists():
        return Profile()

    with open(path) as f:
        data = yaml.safe_load(f) or {}

    return _dict_to_profile(data)


def save_profile(profile: Profile) -> None:
    """Save profile to profile.yaml."""
    path = get_profile_path()
    data = _profile_to_dict(profile)
    with open(path, "w") as f:
        yaml.dump(data, f, default_flow_style=False, sort_keys=False)


def _dict_to_profile(data: dict[str, Any]) -> Profile:
    """Convert nested dict from YAML to Profile dataclass."""
    identity = data.get("identity", {}) or {}
    skills = data.get("skills", {}) or {}
    preferences = data.get("preferences", {}) or {}
    experience = data.get("experience", {}) or {}
    portfolio = data.get("portfolio", {}) or {}

    return Profile(
        name=identity.get("name", "") or "",
        location=identity.get("location", "") or "",
        timezone=identity.get("timezone", "") or "",
        remote_ok=identity.get("remote_ok", True),
        relocation_ok=identity.get("relocation_ok", False),
        languages=skills.get("languages", []) or [],
        frameworks=skills.get("frameworks", []) or [],
        domains=skills.get("domains", []) or [],
        specializations=skills.get("specializations", []) or [],
        niches=preferences.get("niches", []) or [],
        excluded_niches=preferences.get("excluded_niches", []) or [],
        dealbreakers=preferences.get("dealbreakers", []) or [],
        rate_floor=int(preferences.get("rate_floor", 0) or 0),
        hourly_floor=int(preferences.get("hourly_floor", 0) or 0),
        contract_types=preferences.get("contract_types", []) or [],
        years=experience.get("years"),
        seniority=experience.get("seniority", []) or [],
        blocked_companies=preferences.get("blocked_companies", []) or [],
        github=portfolio.get("github", "") or "",
        website=portfolio.get("website", "") or "",
        notable_work=portfolio.get("notable_work", []) or [],
    )


def _profile_to_dict(profile: Profile) -> dict[str, Any]:
    """Convert Profile dataclass to nested dict for YAML."""
    return {
        "identity": {
            "name": profile.name,
            "location": profile.location,
            "timezone": profile.timezone,
            "remote_ok": profile.remote_ok,
            "relocation_ok": profile.relocation_ok,
        },
        "skills": {
            "languages": profile.languages,
            "frameworks": profile.frameworks,
            "domains": profile.domains,
            "specializations": profile.specializations,
        },
        "preferences": {
            "niches": profile.niches,
            "excluded_niches": profile.excluded_niches,
            "dealbreakers": profile.dealbreakers,
            "rate_floor": profile.rate_floor,
            "hourly_floor": profile.hourly_floor,
            "contract_types": profile.contract_types,
        },
        "experience": {
            "years": profile.years,
            "seniority": profile.seniority,
        },
        "portfolio": {
            "github": profile.github,
            "website": profile.website,
            "notable_work": profile.notable_work,
        },
    }
