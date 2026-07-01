"""Scoring layer: signal detection, lead scoring, profile-driven scoring, Tier 4 fit-score."""

from scoring.fit_score import score_company_fit
from scoring.profile import Profile, load_profile, save_profile, profile_exists
from scoring.profile_score import score_against_profile
from scoring.score import score_candidate
from scoring.signals import HARD_SKIP_KEYWORDS, NEGATIVE_SIGNALS, POSITIVE_SIGNALS

__all__ = [
    "score_candidate",
    "score_company_fit",
    "score_against_profile",
    "Profile",
    "load_profile",
    "save_profile",
    "profile_exists",
    "POSITIVE_SIGNALS",
    "NEGATIVE_SIGNALS",
    "HARD_SKIP_KEYWORDS",
]
