"""Signal detection patterns for lead scoring.

Each signal is a (name, regex_pattern, points) tuple.
Patterns are case-insensitive by default.

Verdict gating (see classify_verdict):
  WARM requires ≥1 tech signal AND ≥1 hiring-intent signal.
  HOT requires both plus a fit signal (budget or profile skill match).
"""

import re
from re import Pattern

from leads.schema import LeadStatus, Verdict

SignalDef = tuple[str, str, int]


def _compile(name: str, pattern: str, points: int) -> tuple[str, Pattern[str], int]:
    return (name, re.compile(pattern, re.IGNORECASE), points)


# ── Positive signals ──

POSITIVE_SIGNALS: list[tuple[str, Pattern[str], int]] = [
    # ── Technology / language signals ──
    _compile("cxx_audio", r"(?:\bc\+\+|\bcpp\b)", 3),
    _compile("rust_audio_lang", r"\brust\b", 3),
    _compile("dsp_any", r"\b(?:dsp|digital\s*signal|signal\s*processing)\b", 3),
    _compile("real_time", r"\b(?:real[\s-]?time|realtime|low[\s-]?latency)\b", 3),
    _compile(
        "plugin_format",
        r"\b(?:vst3|clap|ara2?|au|audio\s*unit|audio\s*plugin|audio\s*engine|daw)\b",
        5,
    ),
    _compile(
        "ml_neural",
        r"\b(?:onnx|libtorch|mamba|ssm|state\s*space|neural|ml\s*inference|machine\s*learning)\b",
        8,
    ),
    _compile(
        "edge_inference",
        r"\b(?:on[\s-]?device|edge|cpu[\s-]?only|no\s*cloud|offline\s*inference)\b",
        5,
    ),
    _compile(
        "rust_audio_tools",
        r"\b(?:nih[\s-]?plug|clap[\s-]?rs|rust\s*audio|rust\s*plugin)\b",
        6,
    ),
    _compile(
        "reaper_work",
        r"\b(?:reaper|reascript|reascripts|lua\s*script|sws\s*extension|custom\s*action|daw\s*automation|reaak|reapack)\b",
        5,
    ),
    _compile(
        "audio_impl",
        r"\b(?:codec|optimiz|fixed[\s-]?point|filter\s*design|processing\s*pipeline)\b",
        4,
    ),
    _compile("low_latency", r"\b(?:low\s*latency|<5ms|<1ms|real[\s-]?time\s*constraint)\b", 4),
    # ── Hiring-intent (no bare "remote"/"paid" — those live only in remote_pnw) ──
    _compile(
        "contract_role",
        r"\b(?:contract|contractor|freelance|12[\s-]?month|hiring|looking\s+for|seeking)\b",
        3,
    ),
    _compile(
        "senior_role",
        r"\b(?:senior|lead|staff|principal|head\s*of)\b",
        2,
    ),
    _compile(
        "remote_pnw",
        r"\b(?:remote|vancouver|pacific\s*time|pst|pdt)\b",
        3,
    ),
]

# ── Negative signals ──

NEGATIVE_SIGNALS: list[tuple[str, Pattern[str], int]] = [
    _compile("below_floor", r"\$\s*\d{1,3}\s*(?:per\s*year|annually|annual)", -15),
    _compile("gui_only", r"\bprojucer\b.*\bgui\b(?!.*\b(?:dsp|audio|signal)\b)", -3),
    _compile("mac_only", r"\b(?:mac\s*only|macos\s*only|dante)\b", -10),
    _compile(
        "aggregator_page",
        r"^\d+\s+(?:freelance\s*)?(?:jobs?|positions?)\s+(?:in|across|at)\b",
        -20,
    ),
]

HARD_SKIP_KEYWORDS: list[str] = [
    "revenue share",
    "equity only",
    "profit share",
    "free work",
    "for exposure",
    "unpaid",
    "volunteer",
    "sweat equity",
]

# Conjunctive verdict sets (matched signal names)
TECH_SIGNAL_NAMES: frozenset[str] = frozenset(
    {
        "cxx_audio",
        "rust_audio_lang",
        "dsp_any",
        "real_time",
        "plugin_format",
        "ml_neural",
        "edge_inference",
        "rust_audio_tools",
        "reaper_work",
        "audio_impl",
        "low_latency",
        "skills_language_match",
        "skills_framework_match",
        "domain_match",
        "specialization_match",
    }
)

INTENT_SIGNAL_NAMES: frozenset[str] = frozenset(
    {
        "contract_role",
        "senior_role",
        "remote_pnw",
        "contract_type_match",
    }
)

FIT_SIGNAL_NAMES: frozenset[str] = frozenset(
    {
        "budget_above_floor",
        "rate_above_floor",
        "skills_language_match",
        "skills_framework_match",
        "domain_match",
    }
)


def check_hard_skip(text: str) -> bool:
    """Return True if text matches any hard-skip keyword."""
    lower = text.lower()
    return any(kw in lower for kw in HARD_SKIP_KEYWORDS)


def is_aggregator_page(title: str) -> bool:
    """Detect directory/listing pages that are not actual job postings."""
    if re.search(r"^\d+\s+.*?\b(?:jobs?|positions?)\s+(?:in|across|at)\b", title, re.IGNORECASE):
        return True
    if re.search(r"^\d+\s+.*?\b(?:results?|openings?)\b", title, re.IGNORECASE):
        return True
    if re.search(r"\bhire\s+the\s+\d+\s+best\b", title, re.IGNORECASE):
        return True
    return False


def extract_signals(
    text: str,
    signals: list[tuple[str, Pattern[str], int]],
) -> dict[str, int]:
    """Run regex patterns against text, return dict of matched signal -> points."""
    result: dict[str, int] = {}
    for name, pattern, points in signals:
        if pattern.search(text):
            result[name] = points
    return result


def classify_verdict(
    signals: dict[str, int],
    total: int,
    *,
    hot_threshold: int = 10,
    warm_threshold: int = 5,
) -> tuple[Verdict, LeadStatus]:
    """Map score → verdict with conjunctive tech + intent (+ fit for HOT).

    Keyword stacking alone cannot reach HOT/WARM without both a tech signal
    and a hiring-intent signal. HOT also needs budget or profile skill fit.
    """
    if total <= -500:
        return "SKIP", LeadStatus.SKIPPED

    names = frozenset(signals)
    has_tech = bool(names & TECH_SIGNAL_NAMES)
    has_intent = bool(names & INTENT_SIGNAL_NAMES)
    has_fit = bool(names & FIT_SIGNAL_NAMES)

    if has_tech and has_intent:
        if total >= hot_threshold and has_fit:
            return "HOT", LeadStatus.HOT
        if total >= warm_threshold:
            return "WARM", LeadStatus.WARM

    return "COLD", LeadStatus.COLD
