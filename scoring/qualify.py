"""Lead qualification: scored lead → outreach qualification decision.

Maps a scored Lead (verdict + score + contact) into an outreach bucket:

  QUALIFIED      — HOT score above hot_threshold with a resolvable contact.
  MAYBE          — warm-scored lead, or hot/warm without a contact yet.
  NOT_QUALIFIED  — COLD/SKIP verdict or score below warm_threshold.
"""

from typing import Literal

from config import settings
from leads.schema import Lead

Qualification = Literal["QUALIFIED", "MAYBE", "NOT_QUALIFIED"]


def qualify_lead(
    lead: Lead,
    *,
    hot_threshold: int = settings.hot_threshold,
    warm_threshold: int = settings.warm_threshold,
    require_contact: bool = True,
) -> Qualification:
    """Bucket a scored lead for outreach priority."""
    if lead.verdict in ("SKIP", "COLD"):
        return "NOT_QUALIFIED"
    if lead.score < warm_threshold:
        return "NOT_QUALIFIED"
    if require_contact and not lead.contact_path:
        return "MAYBE"
    if lead.verdict == "HOT" and lead.score >= hot_threshold:
        return "QUALIFIED"
    return "MAYBE"


def should_pursue(
    lead: Lead,
    *,
    hot_threshold: int = settings.hot_threshold,
    warm_threshold: int = settings.warm_threshold,
    require_contact: bool = True,
) -> bool:
    """True if the lead is worth pursuing (QUALIFIED or MAYBE)."""
    return qualify_lead(
        lead,
        hot_threshold=hot_threshold,
        warm_threshold=warm_threshold,
        require_contact=require_contact,
    ) != "NOT_QUALIFIED"
