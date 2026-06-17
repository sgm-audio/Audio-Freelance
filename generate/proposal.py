"""Structured proposal generator with pricing tiers and IP licensing notes."""

import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from leads.schema import Lead

# Pricing tiers (CAD)
PRICING_TIERS = {
    "small": (1500, 3000, "Script, single tool/feature"),
    "medium": (5000, 12000, "Plugin component, integration"),
    "large": (15000, 30000, "Full plugin + UI + testing"),
}

RATE_ANCHORS = {
    "cpp_plugin_contract": "5k-12k (agency: 15k-30k)",
    "ml_inference_integration": "4k-8k (agency: 12k-20k)",
    "reaper_automation": "1.5k-3k (agency: 4k-8k)",
    "realtime_ml": "8k-15k (agency: 25k-50k)",
}

PROPOSAL_DIR = Path(__file__).resolve().parent.parent / "proposals"
PROPOSAL_DIR.mkdir(parents=True, exist_ok=True)


def generate_proposal(
    lead: Lead,
    client_name: str,
    scope: str,
    deliverables: list[str],
    out_of_scope: Optional[list[str]] = None,
    estimated_tier: str = "medium",
    niche: str = "cpp_plugin_contract",
) -> dict:
    """Generate a structured proposal markdown document.

    Returns dict with proposal text and metadata.
    """
    if out_of_scope is None:
        out_of_scope = []

    if estimated_tier not in PRICING_TIERS:
        estimated_tier = "medium"
    tier_min, tier_max, tier_desc = PRICING_TIERS.get(
        estimated_tier, PRICING_TIERS["medium"]
    )
    anchor = RATE_ANCHORS.get(niche, RATE_ANCHORS["cpp_plugin_contract"])

    date_str = datetime.now(tz=timezone.utc).strftime("%Y-%m-%d")
    safe_name = re.sub(r"[^a-zA-Z0-9_-]", "", client_name.lower().replace(" ", "_"))
    if not safe_name:
        safe_name = "client"
    filename = f"{safe_name}_{date_str}.md"

    deliverables_bullets = "\n".join(f"- [x] {d}" for d in deliverables)
    oos_bullets = "\n".join(f"- [ ] {d}" for d in out_of_scope)

    proposal_text = f"""# Proposal: {client_name}

**Date:** {date_str}
**Prepared for:** {client_name}
**Scope:** {scope}
**Tier:** {estimated_tier.capitalize()} ({tier_desc})

---

## Problem

{lead.title}

_{lead.raw_text[:300]}_

---

## Fixed Scope — Deliverables

{deliverables_bullets}

### Explicitly Out of Scope

{oos_bullets}

---

## Investment

**Total:** ${tier_min:,} – ${tier_max:,} CAD
**Payment:** 50/50 split (50% upfront deposit, 50% on delivery)
**Revisions:** 2 rounds included
**Support:** 14-day post-delivery support window

> *Rate anchor: Traditional agency: ~{anchor}*

---

## Timeline

- **Estimated:** 4–6 business weeks (depending on complexity)
- **Buffer:** +1 week built in for revisions

---

## Why

- **Speed:** Existing inference engine/benchmark eliminates months of R&D
- **Verifiable proof:** Public benchmarks and shipped REAPER/CLAP deliverables
- **Focused:** DSP/inference specialist — not a generalist agency spreading across 5 projects

---

## IP Note

> **Underlying engines/tooling (Mamba3, REAPER toolkit components) are LICENSED for this deliverable, not assigned. Only deliverable-specific integration code transfers to {client_name}.**

---

## Next Step

Reply **APPROVED** to start. First milestone (scoping + architecture doc) delivered within 3 business days of deposit.
"""

    # Write to file
    filepath = PROPOSAL_DIR / filename
    with open(filepath, "w") as f:
        f.write(proposal_text)

    return {
        "client": client_name,
        "filename": filename,
        "filepath": str(filepath),
        "proposal": proposal_text,
        "investment_range": f"${tier_min:,} – ${tier_max:,} CAD",
        "payment_terms": "50/50 split (50% upfront deposit)",
        "ip_note": "Underlying engines/tooling are LICENSED, not assigned.",
        "generated_at": datetime.now(tz=timezone.utc).isoformat(),
    }
