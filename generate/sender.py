"""Outreach delivery engine: SMTP transport, Compose URL fallback, and Assisted Platform sends.

Enforces asset-registry claim verification, 30-day recipient/URL deduplication,
RFC 5322 Message-ID threading for Follow-Up #1, and immutable ChromaDB outreach logging.
"""

from __future__ import annotations

import smtplib
from datetime import UTC, datetime, timedelta
from email.message import EmailMessage
from email.utils import formataddr, make_msgid
from urllib.parse import quote

from assets.registry import load_registry, verify_draft_claims
from config import settings
from debug.log import get_logger
from leads.schema import Lead, LeadStatus, infer_channel
from leads.store import check_recent_outreach, record_outreach_send, upsert_lead
from leads.tracking import log_tracking_event

log = get_logger(__name__)


class DuplicateOutreachError(Exception):
    """Raised when a send violates lead step idempotency or the 30-day recipient/URL guard."""

    def __init__(self, reason: str, message: str, prior_send: dict | None = None):
        super().__init__(message)
        self.reason = reason
        self.message = message
        self.prior_send = prior_send


class ClaimViolationError(Exception):
    """Raised when an outreach message references an unshipped/broken portfolio asset."""

    def __init__(self, violations: list[str]):
        super().__init__("; ".join(violations))
        self.violations = violations


def build_compose_urls(recipient: str, subject: str, body: str) -> dict[str, str]:
    """Build mailto: and Gmail web compose URLs for fallback handoff."""
    clean_to = (recipient or "").strip()
    enc_to = quote(clean_to)
    enc_su = quote(subject or "")
    enc_body = quote(body or "")
    return {
        "mailto_url": f"mailto:{enc_to}?subject={enc_su}&body={enc_body}",
        "gmail_url": (
            f"https://mail.google.com/mail/?view=cm&fs=1&to={enc_to}&su={enc_su}&body={enc_body}"
        ),
    }


def send_smtp_email(
    recipient: str,
    subject: str,
    body: str,
    in_reply_to: str | None = None,
) -> str:
    """Dispatch an email via configured SMTP server and return its RFC 5322 Message-ID."""
    if not settings.is_smtp_configured():
        raise RuntimeError("SMTP is not configured in environment variables.")

    sender_email = settings.smtp_user.strip()
    sender_name = settings.smtp_from_name.strip()
    domain = sender_email.split("@", 1)[1] if "@" in sender_email else "localhost"
    msg_id = make_msgid(domain=domain)

    msg = EmailMessage()
    msg["From"] = formataddr((sender_name, sender_email)) if sender_name else sender_email
    msg["To"] = recipient.strip()
    msg["Subject"] = subject.strip()
    msg["Message-ID"] = msg_id

    if in_reply_to and in_reply_to.strip():
        clean_ref = in_reply_to.strip()
        msg["In-Reply-To"] = clean_ref
        msg["References"] = clean_ref

    msg.set_content(body)

    host = settings.smtp_host.strip()
    port = int(settings.smtp_port)

    if port == 465:
        with smtplib.SMTP_SSL(host, port, timeout=20) as server:
            server.login(sender_email, settings.smtp_password)
            server.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=20) as server:
            server.ehlo()
            if settings.smtp_use_tls:
                server.starttls()
                server.ehlo()
            server.login(sender_email, settings.smtp_password)
            server.send_message(msg)

    return msg_id


def execute_outreach_send(
    lead: Lead,
    body: str,
    subject: str | None = None,
    recipient_email: str | None = None,
    target_url: str | None = None,
    step: str = "initial",
    mode: str = "auto",
    asset_id: str | None = None,
    force: bool = False,
) -> dict:
    """Validate guardrails, execute email/assisted send, update lead lifecycle, and log audit record."""
    if step not in ("initial", "follow_up_1"):
        raise ValueError(f"Invalid outreach step '{step}'. Must be 'initial' or 'follow_up_1'.")

    clean_body = (body or "").strip()
    if not clean_body:
        raise ValueError("Outreach body cannot be empty.")

    # 1. Asset registry claim check
    registry = load_registry()
    violations = verify_draft_claims(f"{subject or ''}\n{clean_body}", registry)
    if violations and not force:
        raise ClaimViolationError(violations)

    clean_email = (
        recipient_email if recipient_email is not None else (lead.contact_email or "")
    ).strip()
    clean_url = (target_url or lead.url or "").strip()

    if mode in ("email", "smtp", "compose"):
        effective_mode = "email"
    elif mode == "assisted":
        effective_mode = "assisted"
    else:
        effective_mode = "email" if clean_email else "assisted"

    if effective_mode == "email" and not clean_email:
        raise ValueError("Recipient email is required for email send mode.")

    # 2. Idempotency & 30-day duplicate recipient/URL guard
    if not force:
        if step == "initial" and lead.status in (
            LeadStatus.SENT,
            LeadStatus.FOLLOW_UP_1_DUE,
            LeadStatus.FOLLOW_UP_1_SENT,
        ):
            raise DuplicateOutreachError(
                reason="already_sent_lead",
                message=f"Lead is already in '{lead.status.value}' status.",
            )
        if step == "follow_up_1" and (lead.follow_up_count or 0) >= 1:
            raise DuplicateOutreachError(
                reason="already_sent_follow_up",
                message="Follow-Up #1 has already been sent for this lead.",
            )

        conflict = check_recent_outreach(
            recipient=clean_email if effective_mode == "email" else None,
            target_url=clean_url,
            lead_id=str(lead.id),
            step=step,
        )
        if conflict is not None:
            raise DuplicateOutreachError(
                reason=conflict["reason"],
                message=conflict["message"],
                prior_send=conflict.get("prior_send"),
            )

    # 3. Execute transport
    now = datetime.now(tz=UTC)
    compose_urls: dict[str, str] = {}
    message_id = ""

    if effective_mode == "email":
        final_subject = (
            subject
            or lead.last_subject
            or f"your {lead.niche.replace('_', ' ')} project"
        ).strip()
        if step == "follow_up_1" and not final_subject.lower().startswith("re:"):
            final_subject = f"Re: {final_subject}"

        compose_urls = build_compose_urls(clean_email, final_subject, clean_body)
        if settings.is_smtp_configured() and mode != "compose":
            in_reply_to = lead.last_message_id if step == "follow_up_1" else None
            message_id = send_smtp_email(
                recipient=clean_email,
                subject=final_subject,
                body=clean_body,
                in_reply_to=in_reply_to,
            )
            transport_used = "smtp"
        else:
            transport_used = "compose"
        channel = "email"
    else:
        final_subject = (subject or lead.last_subject or "").strip()
        transport_used = "assisted"
        channel = infer_channel(
            url=clean_url,
            source=lead.source,
            contact_email=None,
            contact_path=lead.contact_path,
        )

    # 4. Update Lead lifecycle & follow-up timers
    old_status = lead.status
    if clean_email:
        lead.contact_email = clean_email
    lead.channel = channel
    if final_subject:
        lead.last_subject = final_subject
    if asset_id:
        lead.last_asset_id = asset_id
    if message_id and step == "initial":
        lead.last_message_id = message_id

    if step == "initial":
        lead.status = LeadStatus.SENT
        lead.sent_at = now
        lead.follow_up_count = 0
        delay_days = (
            settings.follow_up_email_days
            if channel == "email"
            else settings.follow_up_dm_days
        )
        lead.next_follow_up_at = now + timedelta(days=delay_days)
    else:
        lead.status = LeadStatus.FOLLOW_UP_1_SENT
        lead.follow_up_count = (lead.follow_up_count or 0) + 1
        lead.next_follow_up_at = None

    upsert_lead(lead)

    log_tracking_event(
        str(lead.id),
        "status_change",
        {
            "from_status": old_status.value,
            "to_status": lead.status.value,
            "from_verdict": lead.verdict,
            "step": step,
            "transport": transport_used,
        },
    )

    # 5. Record immutable outreach log entry in ChromaDB
    log_entry = record_outreach_send(
        lead_id=str(lead.id),
        step=step,
        channel=channel,
        recipient=clean_email if effective_mode == "email" else None,
        target_url=clean_url,
        subject=final_subject,
        final_body_sent=clean_body,
        asset_used=asset_id or lead.last_asset_id,
        transport=transport_used,
        message_id=message_id,
        sent_at=now,
    )

    return {
        "status": "sent",
        "lead_id": str(lead.id),
        "step": step,
        "channel": channel,
        "transport": transport_used,
        "message_id": message_id,
        "recipient_email": clean_email,
        "target_url": clean_url,
        "subject": final_subject,
        "sent_at": now.isoformat(),
        "next_follow_up_at": (
            lead.next_follow_up_at.isoformat() if lead.next_follow_up_at else None
        ),
        "compose_urls": compose_urls,
        "lead": lead.model_dump(mode="json"),
        "log_entry": log_entry,
    }
