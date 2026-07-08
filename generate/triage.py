"""Reply triage: classify lead replies and route to appropriate action."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class TriageResult:
    """Classified reply with recommended action."""

    lead_id: str = ""
    lead_title: str = ""
    lead_company: str = ""
    classification: str = "unknown"  # proposal | rate | decline | dead | follow_up
    confidence: float = 0.0
    reasoning: str = ""
    suggested_response: str = ""
    suggested_action: str = ""  # send_proposal | send_rate | archive | mark_dead | bump


# Patterns for classification
_PROPOSAL_KEYWORDS = [
    "interested",
    "send proposal",
    "tell me more",
    "scope",
    "budget",
    "timeline",
    "next steps",
    "let's talk",
    "would like to discuss",
    "sounds good",
    "can you provide",
    "what would it cost",
    "how much",
    "pricing",
]
_RATE_KEYWORDS = [
    "rate",
    "rates",
    "cost",
    "how much do you charge",
    "hourly rate",
    "day rate",
    "what's your",
    "pricing structure",
    "ballpark",
]
_DECLINE_KEYWORDS = [
    "not interested",
    "no thanks",
    "not hiring",
    "position filled",
    "going with someone else",
    "not a fit",
    "too expensive",
    "found someone",
    "already hired",
    "no longer",
    "moving forward with other",
]
_DEAD_KEYWORDS_IMMEDIATE = [
    "bounced",
    "no such address",
    "address not found",
    "mailbox full",
    "no longer with the company",
    "left the company",
]


def classify_reply(reply_text: str, lead_context: dict[str, Any] | None = None) -> TriageResult:
    """Classify a reply from a lead and recommend next action.

    Args:
        reply_text: The text of the reply.
        lead_context: Optional dict with lead metadata (status, score, niche, company).

    Returns:
        TriageResult with classification and suggested action.
    """
    text_lower = reply_text.lower().strip()

    # Too short to classify
    if len(text_lower) < 5:
        return TriageResult(
            classification="unknown",
            confidence=0.0,
            reasoning="Reply too short to classify.",
            suggested_action="follow_up",
        )

    # Check dead patterns first (bounced emails, person left)
    dead_score = sum(1 for kw in _DEAD_KEYWORDS_IMMEDIATE if kw in text_lower)
    if dead_score >= 1:
        return TriageResult(
            classification="dead",
            confidence=0.9,
            reasoning=f"Matched {dead_score} dead-signal keyword(s).",
            suggested_action="mark_dead",
        )

    # Count keyword matches
    proposal_hits = sum(1 for kw in _PROPOSAL_KEYWORDS if kw in text_lower)
    rate_hits = sum(1 for kw in _RATE_KEYWORDS if kw in text_lower)
    decline_hits = sum(1 for kw in _DECLINE_KEYWORDS if kw in text_lower)

    # Additional signals from lead context
    if lead_context:
        status = lead_context.get("status", "")
        score = lead_context.get("score", 0)
        # High-score HOT leads asking about rates = proposal opportunity
        if status == "HOT" and score >= 10 and rate_hits >= 1:
            proposal_hits += 2

    # Classify based on strongest signal
    if proposal_hits >= 2 or (proposal_hits >= 1 and rate_hits >= 1):
        return TriageResult(
            classification="proposal",
            confidence=min(0.9, proposal_hits * 0.3),
            reasoning=f"Proposal signal: {proposal_hits} keyword(s). Rate interest: {rate_hits}.",
            suggested_action="send_proposal",
            suggested_response="Send structured proposal with scope, timeline, and pricing tiers.",
        )
    elif rate_hits >= 2 or (rate_hits >= 1 and proposal_hits == 0):
        return TriageResult(
            classification="rate",
            confidence=min(0.85, rate_hits * 0.35),
            reasoning=f"Rate inquiry: {rate_hits} keyword(s).",
            suggested_action="send_rate",
            suggested_response="Respond with rate card and portfolio link.",
        )
    elif decline_hits >= 1 and proposal_hits == 0 and rate_hits == 0:
        return TriageResult(
            classification="decline",
            confidence=min(0.9, decline_hits * 0.5),
            reasoning=f"Decline signal: {decline_hits} keyword(s).",
            suggested_action="archive",
            suggested_response="Acknowledge and archive. No further action.",
        )
    else:
        # Ambiguous — flag for human review
        return TriageResult(
            classification="unknown",
            confidence=0.3,
            reasoning=f"No strong signal detected (proposal={proposal_hits}, rate={rate_hits}, decline={decline_hits}).",
            suggested_action="follow_up",
            suggested_response="Reply is ambiguous — review manually and follow up if needed.",
        )


def batch_triage(replies: list[dict[str, Any]]) -> list[TriageResult]:
    """Classify multiple replies at once.

    Args:
        replies: List of dicts with 'lead_id', 'reply_text', and optional 'context'.

    Returns:
        List of TriageResult objects.
    """
    results = []
    for r in replies:
        result = classify_reply(
            reply_text=r.get("reply_text", ""),
            lead_context=r.get("context"),
        )
        result.lead_id = r.get("lead_id", "")
        results.append(result)
    return results
