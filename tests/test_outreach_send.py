"""End-to-end unit and API tests for the Outreach Send & Follow-Up Engine."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from config import settings
from generate.outreach import generate_follow_up, generate_outreach, split_subject_and_body
from generate.sender import (
    ClaimViolationError,
    DuplicateOutreachError,
    execute_outreach_send,
)
from leads.schema import Lead, LeadStatus
from leads.store import (
    ensure_collections_initialized,
    get_lead_by_id,
    upsert_lead,
)
from main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_store(tmp_path, monkeypatch):
    """Isolate ChromaDB collections and tracking dir per test."""
    import uuid

    import leads.store as store_mod
    import leads.tracking as tracking_mod

    chroma_dir = tmp_path / "chroma_outreach"
    chroma_dir.mkdir(parents=True, exist_ok=True)
    track_dir = tmp_path / "tracking_outreach"
    track_dir.mkdir(parents=True, exist_ok=True)

    suffix = uuid.uuid4().hex[:8]
    monkeypatch.setattr(store_mod, "_DATA_DIR", chroma_dir)
    monkeypatch.setattr(store_mod, "CHROMA_COLLECTION_LEADS", f"leads_{suffix}")
    monkeypatch.setattr(store_mod, "CHROMA_COLLECTION_OUTREACH", f"outreach_{suffix}")
    monkeypatch.setattr(store_mod, "_allow_test_source", True)
    monkeypatch.setattr(tracking_mod, "TRACKING_DIR", track_dir)
    ensure_collections_initialized()
    yield


def test_split_subject_and_body():
    draft = "Subject: your VST3/CLAP plugin\n\nHi there,\n\nSaw you need C++ DSP."
    subject, body = split_subject_and_body(draft)
    assert subject == "your VST3/CLAP plugin"
    assert body.startswith("Hi there,")
    assert "Subject:" not in body


def test_generate_outreach_returns_composer_metadata():
    lead = Lead(
        source="manual",
        tier=1,
        title="REAPER Batch Render Script",
        url="https://indiegame.studio/jobs/reaper",
        raw_text="Need Lua automation for REAPER. Contact audio@indiegame.studio",
        niche="reaper_scripts",
    )
    res = generate_outreach(lead, template_key="B_reaper_automation")
    assert res["subject"] == "your REAPER workflow"
    assert "I automate REAPER workflows" in res["body"]
    assert res["contact_email"] == "audio@indiegame.studio"
    assert res["channel"] == "email"
    assert res["selected_asset_id"] == "sgm_suno_reapack"
    assert any(a["id"] == "apc_mcp" for a in res["available_assets"])
    assert res["safe_to_send"] is True


def test_smtp_send_and_threaded_follow_up(monkeypatch):
    """SMTP send sets Message-ID, 4-day timer, and threads Follow-Up #1 with In-Reply-To."""
    monkeypatch.setattr(settings, "smtp_host", "smtp.testmail.local")
    monkeypatch.setattr(settings, "smtp_port", 587)
    monkeypatch.setattr(settings, "smtp_user", "scott@sgmstudios.ca")
    monkeypatch.setattr(settings, "smtp_password", "app-secret-pass")
    monkeypatch.setattr(settings, "smtp_from_name", "Scott")

    sent_messages = []

    class FakeSMTP:
        def __init__(self, host, port, timeout=20):
            self.host = host
            self.port = port

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def ehlo(self):
            pass

        def starttls(self):
            pass

        def login(self, user, password):
            pass

        def send_message(self, msg):
            sent_messages.append(msg)

    lead = Lead(
        source="manual",
        tier=1,
        title="JUCE C++ Synthesizer Plugin",
        company="SynthCo",
        url="https://synthco.io/careers/dsp",
        raw_text="Looking for C++ DSP engineer. Email jobs@synthco.io",
        niche="plugin_dev",
        verdict="HOT",
        status=LeadStatus.HOT,
    )
    upsert_lead(lead)

    with patch("generate.sender.smtplib.SMTP", FakeSMTP):
        result = execute_outreach_send(
            lead=lead,
            subject="your VST3/CLAP plugin",
            body="Hi there, I build real-time C++ audio plugins (apc_mcp).",
            recipient_email="jobs@synthco.io",
            step="initial",
            mode="email",
            asset_id="apc_mcp",
        )

    assert result["transport"] == "smtp"
    assert result["channel"] == "email"
    assert result["message_id"].endswith("@sgmstudios.ca>")
    assert len(sent_messages) == 1
    assert sent_messages[0]["Subject"] == "your VST3/CLAP plugin"
    assert sent_messages[0]["To"] == "jobs@synthco.io"

    updated_lead = get_lead_by_id(lead.id)
    assert updated_lead is not None
    assert updated_lead.status == LeadStatus.SENT
    assert updated_lead.last_message_id == result["message_id"]
    assert updated_lead.next_follow_up_at is not None
    # Email timer defaults to 4 days
    delta = updated_lead.next_follow_up_at - updated_lead.sent_at
    assert 3.9 <= delta.total_seconds() / 86400 <= 4.1

    # Generate Follow-Up #1 draft and verify threading metadata
    fu_draft = generate_follow_up(updated_lead)
    assert fu_draft["subject"] == "Re: your VST3/CLAP plugin"
    assert fu_draft["in_reply_to"] == result["message_id"]

    # Send Follow-Up #1 via SMTP and verify In-Reply-To & References headers
    with patch("generate.sender.smtplib.SMTP", FakeSMTP):
        fu_res = execute_outreach_send(
            lead=updated_lead,
            subject=fu_draft["subject"],
            body=fu_draft["body"],
            recipient_email="jobs@synthco.io",
            step="follow_up_1",
            mode="email",
            asset_id="apc_mcp",
        )

    assert fu_res["transport"] == "smtp"
    assert len(sent_messages) == 2
    assert sent_messages[1]["Subject"] == "Re: your VST3/CLAP plugin"
    assert sent_messages[1]["In-Reply-To"] == result["message_id"]
    assert sent_messages[1]["References"] == result["message_id"]

    after_fu = get_lead_by_id(lead.id)
    assert after_fu is not None
    assert after_fu.status == LeadStatus.FOLLOW_UP_1_SENT
    assert after_fu.follow_up_count == 1
    assert after_fu.next_follow_up_at is None


def test_compose_fallback_and_assisted_send(monkeypatch):
    """Unconfigured SMTP falls back to compose URLs; platform URLs use assisted mode."""
    monkeypatch.setattr(settings, "smtp_host", "")
    monkeypatch.setattr(settings, "smtp_user", "")
    monkeypatch.setattr(settings, "smtp_password", "")

    lead_email = Lead(
        source="manual",
        tier=1,
        title="Audio Engine Contract",
        url="https://studio.example.org/contract",
        raw_text="Contact producer@studio.io",
        niche="rust_audio",
    )
    upsert_lead(lead_email)

    res_compose = execute_outreach_send(
        lead=lead_email,
        subject="Rust audio engine",
        body="Hi there, saw your Rust audio contract.",
        recipient_email="producer@studio.io",
        step="initial",
        mode="auto",
    )
    assert res_compose["transport"] == "compose"
    assert "mailto:producer%40studio.io" in res_compose["compose_urls"]["mailto_url"]
    assert "mail.google.com" in res_compose["compose_urls"]["gmail_url"]

    # Assisted send for Reddit lead sets 3-day follow-up timer
    lead_reddit = Lead(
        source="reddit",
        tier=2,
        title="[Hiring] Game audio programmer",
        url="https://www.reddit.com/r/INAT/comments/12345",
        raw_text="Looking for C++ audio programmer for Unreal project.",
        niche="game_audio_dev",
    )
    upsert_lead(lead_reddit)

    res_assisted = execute_outreach_send(
        lead=lead_reddit,
        subject="Game audio tooling",
        body="Hey! Saw your post on r/INAT.",
        step="initial",
        mode="assisted",
    )
    assert res_assisted["transport"] == "assisted"
    assert res_assisted["channel"] == "reddit"
    updated_reddit = get_lead_by_id(lead_reddit.id)
    assert updated_reddit is not None
    assert updated_reddit.status == LeadStatus.SENT
    delta_days = (updated_reddit.next_follow_up_at - updated_reddit.sent_at).total_seconds() / 86400
    assert 2.9 <= delta_days <= 3.1


def test_duplicate_recipient_and_claim_guardrails(monkeypatch):
    """Blocks double-sending to the same email within 30 days and blocks unshipped asset claims."""
    monkeypatch.setattr(settings, "smtp_host", "")

    lead1 = Lead(
        source="manual",
        tier=1,
        title="Plugin Role 1",
        url="https://company-a.io/job1",
        raw_text="Email dev@company-a.io",
        niche="plugin_dev",
    )
    lead2 = Lead(
        source="manual",
        tier=1,
        title="Plugin Role 2",
        url="https://company-a.io/job2",
        raw_text="Email dev@company-a.io",
        niche="plugin_dev",
    )
    upsert_lead(lead1)
    upsert_lead(lead2)

    # Unshipped asset claim (clara_mamba_suite is in_progress) should be blocked
    with pytest.raises(ClaimViolationError):
        execute_outreach_send(
            lead=lead1,
            subject="Hello",
            body="I shipped clara_mamba_suite in production.",
            recipient_email="dev@company-a.io",
        )

    # Valid send on lead1 succeeds
    execute_outreach_send(
        lead=lead1,
        subject="Hello",
        body="I shipped apc_mcp on GitHub.",
        recipient_email="dev@company-a.io",
    )

    # Pitching the same recipient email on lead2 within 30 days raises DuplicateOutreachError
    with pytest.raises(DuplicateOutreachError) as exc_info:
        execute_outreach_send(
            lead=lead2,
            subject="Hello again",
            body="Pitching second job post to same email.",
            recipient_email="dev@company-a.io",
        )
    assert exc_info.value.reason == "duplicate_recipient"

    # Explicit force=True overrides the duplicate check
    forced = execute_outreach_send(
        lead=lead2,
        subject="Hello again",
        body="Pitching second job post with explicit override.",
        recipient_email="dev@company-a.io",
        force=True,
    )
    assert forced["status"] == "sent"


def test_follow_up_queue_and_api_endpoints(monkeypatch):
    """Overdue SENT leads surface in /api/v1/outreach/follow-ups as FOLLOW_UP_1_DUE."""
    monkeypatch.setattr(settings, "smtp_host", "")


    overdue_lead = Lead(
        source="manual",
        tier=1,
        title="Overdue Lead",
        url="https://overdue.studio/job",
        raw_text="Email hire@overdue.studio",
        niche="plugin_dev",
        status=LeadStatus.SENT,
        sent_at=datetime.now(tz=UTC) - timedelta(days=5),
        next_follow_up_at=datetime.now(tz=UTC) - timedelta(days=1),
    )
    upcoming_lead = Lead(
        source="manual",
        tier=1,
        title="Upcoming Lead",
        url="https://upcoming.studio/job",
        raw_text="Email hire@upcoming.studio",
        niche="plugin_dev",
        status=LeadStatus.SENT,
        sent_at=datetime.now(tz=UTC) - timedelta(days=1),
        next_follow_up_at=datetime.now(tz=UTC) + timedelta(days=3),
    )
    upsert_lead(overdue_lead)
    upsert_lead(upcoming_lead)

    resp = client.get("/api/v1/outreach/follow-ups")
    assert resp.status_code == 200
    data = resp.json()
    assert data["due_count"] == 1
    assert data["upcoming_count"] == 1
    assert data["due"][0]["id"] == str(overdue_lead.id)
    assert data["due"][0]["status"] == "FOLLOW_UP_1_DUE"

    # Generate Follow-Up #1 draft via API
    fu_resp = client.post(f"/api/v1/outreach/{overdue_lead.id}/follow-up/draft")
    assert fu_resp.status_code == 200
    fu_data = fu_resp.json()
    assert fu_data["subject"].startswith("Re:")
    assert fu_data["step"] == "follow_up_1"

    # Send Follow-Up #1 via API
    send_resp = client.post(
        f"/api/v1/outreach/{overdue_lead.id}/send",
        json={
            "subject": fu_data["subject"],
            "body": fu_data["body"],
            "recipient_email": "hire@overdue.studio",
            "step": "follow_up_1",
            "mode": "email",
        },
    )
    assert send_resp.status_code == 200
    assert send_resp.json()["lead"]["status"] == "FOLLOW_UP_1_SENT"

    # Verify outreach log API returns the sent entry
    log_resp = client.get(f"/api/v1/outreach/log?lead_id={overdue_lead.id}")
    assert log_resp.status_code == 200
    assert log_resp.json()["count"] == 1
