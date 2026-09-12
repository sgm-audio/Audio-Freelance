"""Scoring layer: signal detection, lead scoring, profile-driven scoring,
qualification, Tier 4 fit-score."""

from scoring.fit_score import score_company_fit
from scoring.profile import Profile, load_profile, profile_exists, save_profile
from scoring.profile_score import score_against_profile
from scoring.qualify import Qualification, qualify_lead, should_pursue
from scoring.score import score_candidate
from scoring.signals import HARD_SKIP_KEYWORDS, NEGATIVE_SIGNALS, POSITIVE_SIGNALS

__all__ = [
    "score_candidate",
    "score_company_fit",
    "score_against_profile",
    "qualify_lead",
    "should_pursue",
    "Qualification",
    "Profile",
    "load_profile",
    "save_profile",
    "profile_exists",
    "POSITIVE_SIGNALS",
    "NEGATIVE_SIGNALS",
    "HARD_SKIP_KEYWORDS",
]
