"""Outreach draft generator with templates A-D and asset-registry claim validation."""

import contextlib
from datetime import UTC, datetime

from assets.registry import AssetRegistry, load_registry, verify_draft_claims
from config import settings
from leads.schema import Lead, extract_email, infer_channel
from leads.store import get_outreach_history, log_outreach

_registry: AssetRegistry | None = None


def _get_registry() -> AssetRegistry:
    global _registry
    if _registry is None:
        _registry = load_registry()
    return _registry


def split_subject_and_body(draft: str) -> tuple[str, str]:
    """Split a 'Subject: ...\n\nBody...' draft into (subject, body)."""
    lines = draft.strip().splitlines()
    if lines and lines[0].lower().startswith("subject:"):
        subject = lines[0].split(":", 1)[1].strip()
        body = "\n".join(lines[1:]).lstrip("\n").strip()
        return subject, body
    return "", draft.strip()


def _select_asset_for_lead(lead: Lead, asset_id: str | None = None):
    """Select the requested shipped asset or default to the best match for the lead's niche."""
    registry = _get_registry()
    all_assets = registry.all()
    if asset_id and asset_id in all_assets:
        return all_assets[asset_id]

    niche_default_map = {
        "reaper_scripts": "sgm_suno_reapack",
        "audio_ml": "portfolio_case_studies",
        "plugin_dev": "apc_mcp",
        "rust_audio": "apc_mcp",
        "game_audio_dev": "apc_mcp",
    }
    preferred_id = niche_default_map.get(lead.niche, "apc_mcp")
    if preferred_id in all_assets and all_assets[preferred_id].status == "shipped":
        return all_assets[preferred_id]

    shipped = [a for a in all_assets.values() if a.status == "shipped"]
    return shipped[0] if shipped else None


def list_shipped_assets() -> list[dict]:
    """Return serialized list of shipped portfolio assets for the UI selector."""
    registry = _get_registry()
    return [
        {
            "id": a.id,
            "status": a.status,
            "description": a.description.strip(),
            "proof": a.proof,
            "pitch_value": a.pitch_value,
        }
        for a in registry.all().values()
        if a.status == "shipped"
    ]


TEMPLATES = {
    "A_plugin_contract": """Subject: your {format} plugin

Hi {name},

Saw you need {tech} development for {context}.

I build real-time audio engines (C++/Rust) — {asset_proof}.

15 min to see if this fits your timeline?

No pressure either way.

P.S. {demo_link}""",
    "B_reaper_automation": """Subject: your {daw} workflow

Hey {name},

Noticed {specific_repetitive_task}.

I automate REAPER workflows — batch processing, tagging, rendering, Lua scripting. {asset_proof}.

Want me to script your biggest time-suck? 15 min chat.

No pressure.

P.S. {script_demo_link}""",
    "C_game_audio": """Subject: real-time audio on {platform}

Hi {name},

Working on {game} — saw you need real-time audio tooling.

I ship C++/Rust audio engines for plugins and game-adjacent pipelines — {asset_proof}.

Quick screen share to discuss?

No pressure.

P.S. {demo_link}""",
    "D_cold_outbound": """Subject: {company}'s {product_area}

Hi {name},

{specific_observation_about_their_product_or_recent_post}.

I work on real-time, CPU-only neural audio inference (Mamba/SSM architectures) — {asset_proof}. Case study: {demo_link}.

If you ever need contract DSP/inference work, happy to do a quick intro call.

No pressure either way.

P.S. {demo_link}""",
}


def _default_context(lead: Lead, asset_id: str | None = None) -> dict:
    """Fill template placeholders from lead fields + shipped asset proof.

    Drafts are for human edit — greeting defaults to 'there' when no contact name exists.
    """
    proof = _select_asset_for_lead(lead, asset_id=asset_id)
    niche = lead.niche.replace("_", " ")
    company = lead.company or "your team"
    title = lead.title or niche
    observation = (lead.raw_text or title).strip()
    if len(observation) > 160:
        observation = observation[:157] + "..."
    link = proof.proof if (proof and proof.proof) else lead.url
    asset_proof = proof.pitch_value if proof else "shipped real-time audio tooling"

    return {
        "name": "there",
        "company": company,
        "format": "VST3/CLAP",
        "tech": niche,
        "context": title,
        "asset_proof": asset_proof,
        "demo_link": link,
        "daw": "REAPER",
        "specific_repetitive_task": title,
        "script_demo_link": link,
        "platform": "PC/console",
        "game": title,
        "benchmark_link": link,
        "product_area": niche,
        "specific_observation_about_their_product_or_recent_post": observation
        or f"your work at {company}",
        "_selected_asset_id": proof.id if proof else "",
    }


def template_for_niche(niche: str) -> str:
    """Pick a default template key from lead niche."""
    mapping = {
        "plugin_dev": "A_plugin_contract",
        "rust_audio": "A_plugin_contract",
        "reaper_scripts": "B_reaper_automation",
        "game_audio_dev": "C_game_audio",
        "audio_ml": "D_cold_outbound",
    }
    return mapping.get(niche, "A_plugin_contract")


def generate_outreach(
    lead: Lead,
    template_key: str = "A_plugin_contract",
    context: dict | None = None,
    asset_id: str | None = None,
) -> dict:
    """Generate an outreach draft for a lead using the specified template.

    Validates all asset claims against the registry before returning.
    Logs the draft to the outreach ChromaDB collection.
    """
    template = TEMPLATES.get(template_key)
    if template is None:
        raise ValueError(
            f"Unknown template '{template_key}'. Available: {', '.join(TEMPLATES.keys())}"
        )

    # Caller overrides win over lead-derived defaults
    base_ctx = _default_context(lead, asset_id=asset_id)
    selected_asset_id = base_ctx.pop("_selected_asset_id", "")
    filled = {**base_ctx, **(context or {})}
    draft = template.format(**filled)
    subject, body = split_subject_and_body(draft)

    # Pre-flight claim validation
    registry = _get_registry()
    violations = verify_draft_claims(draft, registry)

    contact_email = lead.contact_email or extract_email(
        lead.contact_path, lead.raw_text, lead.title
    )
    channel = lead.channel or infer_channel(
        url=lead.url,
        source=lead.source,
        contact_email=contact_email,
        contact_path=lead.contact_path,
    )

    result = {
        "lead_id": str(lead.id),
        "template": template_key,
        "draft": draft,
        "subject": subject,
        "body": body,
        "contact_email": contact_email or "",
        "channel": channel,
        "target_url": lead.url,
        "selected_asset_id": selected_asset_id,
        "available_assets": list_shipped_assets(),
        "smtp_configured": settings.is_smtp_configured(),
        "generated_at": datetime.now(tz=UTC).isoformat(),
        "violations": violations,
        "safe_to_send": len(violations) == 0,
    }

    # Log to ChromaDB outreach collection
    with contextlib.suppress(Exception):
        log_outreach(
            lead_id=str(lead.id),
            template_used=template_key,
            draft_text=draft,
            status="BLOCKED" if violations else "DRAFTED",
        )

    return result


def generate_follow_up(
    lead: Lead,
    asset_id: str | None = None,
) -> dict:
    """Generate a concise 2-3 sentence Follow-Up #1 draft for a sent lead.

    Threads under the original subject (`Re: ...`) and references a shipped asset.
    """
    history: list[dict] = []
    with contextlib.suppress(Exception):
        history = get_outreach_history(lead_id=str(lead.id), sent_only=True, limit=5)

    initial_send = next((h for h in history if h.get("step") == "initial"), None)
    if initial_send is None and history:
        initial_send = history[0]

    prior_subject = (
        (initial_send.get("subject") if initial_send else None)
        or lead.last_subject
        or f"your {lead.niche.replace('_', ' ')} project"
    )
    if not prior_subject.lower().startswith("re:"):
        subject = f"Re: {prior_subject}"
    else:
        subject = prior_subject

    in_reply_to = (
        (initial_send.get("message_id") if initial_send else None)
        or lead.last_message_id
        or ""
    )

    proof = _select_asset_for_lead(lead, asset_id=asset_id or lead.last_asset_id)
    asset_proof = proof.pitch_value if proof else "shipped real-time audio tooling"
    demo_link = proof.proof if (proof and proof.proof) else lead.url
    selected_asset_id = proof.id if proof else ""

    niche_label = lead.niche.replace("_", " ")
    context_title = lead.title or lead.company or niche_label

    body = (
        f"Hi there,\n\n"
        f"Quick bump on my note below regarding {context_title} — if you still need a hand with "
        f"{niche_label}, I'd be glad to share a quick prototype or jump on a 10-minute call this week.\n\n"
        f"For reference, {asset_proof}: {demo_link}\n\n"
        f"No worries at all if the role is already filled."
    )
    draft = f"Subject: {subject}\n\n{body}"

    registry = _get_registry()
    violations = verify_draft_claims(draft, registry)

    contact_email = (
        (initial_send.get("recipient") if initial_send else None)
        or lead.contact_email
        or extract_email(lead.contact_path, lead.raw_text, lead.title)
        or ""
    )
    channel = lead.channel or infer_channel(
        url=lead.url,
        source=lead.source,
        contact_email=contact_email or None,
        contact_path=lead.contact_path,
    )

    return {
        "lead_id": str(lead.id),
        "step": "follow_up_1",
        "subject": subject,
        "body": body,
        "draft": draft,
        "in_reply_to": in_reply_to,
        "contact_email": contact_email,
        "channel": channel,
        "target_url": lead.url,
        "selected_asset_id": selected_asset_id,
        "available_assets": list_shipped_assets(),
        "smtp_configured": settings.is_smtp_configured(),
        "generated_at": datetime.now(tz=UTC).isoformat(),
        "violations": violations,
        "safe_to_send": len(violations) == 0,
    }

