"""Tests for leads/schema.py"""

import uuid

import pytest
from pydantic import ValidationError

from leads.schema import PREFERRED_NICHES, Lead, LeadStatus, RawCandidate


class TestLeadModel:
    def test_valid_lead(self):
        lead = Lead(
            source="test",
            tier=1,
            title="Test Lead",
            url="https://example.com/job",
            raw_text="Looking for C++ DSP developer",
            niche="plugin_dev",
        )
        assert lead.source == "test"
        assert lead.tier == 1
        assert lead.status == LeadStatus.NEW
        assert lead.verdict == "COLD"
        assert isinstance(lead.id, uuid.UUID)
        assert lead.discovered_at.tzinfo is not None

    def test_invalid_niche(self):
        with pytest.raises(ValidationError, match="Unknown niche"):
            Lead(
                source="test",
                tier=1,
                title="Bad Niche",
                url="https://example.com",
                raw_text="test",
                niche="invalid_niche",
            )

    def test_empty_url(self):
        with pytest.raises(ValidationError, match="url must not be empty"):
            Lead(
                source="test",
                tier=1,
                title="No URL",
                url="   ",
                raw_text="test",
                niche="plugin_dev",
            )

    def test_invalid_url_format(self):
        with pytest.raises(ValidationError, match="must start with http"):
            Lead(
                source="test",
                tier=1,
                title="Bad URL",
                url="not-a-url",
                raw_text="test",
                niche="plugin_dev",
            )

    def test_tier_out_of_range(self):
        with pytest.raises(ValidationError):
            Lead(
                source="test",
                tier=6,
                title="Bad Tier",
                url="https://example.com",
                raw_text="test",
                niche="plugin_dev",
            )

    def test_tier_zero(self):
        with pytest.raises(ValidationError):
            Lead(
                source="test",
                tier=0,
                title="Zero Tier",
                url="https://example.com",
                raw_text="test",
                niche="plugin_dev",
            )

    def test_all_verdicts(self):
        for v in ("HOT", "WARM", "COLD", "SKIP"):
            lead = Lead(
                source="test",
                tier=1,
                title=f"Verdict {v}",
                url="https://example.com",
                raw_text="test",
                niche="plugin_dev",
                verdict=v,
            )
            assert lead.verdict == v

    def test_verdict_invalid(self):
        with pytest.raises(ValidationError):
            Lead(
                source="test",
                tier=1,
                title="Bad Verdict",
                url="https://example.com",
                raw_text="test",
                niche="plugin_dev",
                verdict="INVALID",
            )

    def test_lead_status_values(self):
        assert LeadStatus.NEW.value == "NEW"
        assert LeadStatus.HOT.value == "HOT"
        assert LeadStatus.WON.value == "WON"
        assert LeadStatus.DEAD.value == "DEAD"
        # 12 statuses: NEW, SCORED, HOT, WARM, COLD, SKIPPED,
        # CONTACTED, REPLIED, PROPOSAL_SENT, WON, LOST, DEAD
        assert len(LeadStatus) == 12

    def test_preferred_niches(self):
        assert "plugin_dev" in PREFERRED_NICHES
        assert "reaper_scripts" in PREFERRED_NICHES
        assert "rust_audio" in PREFERRED_NICHES
        assert "audio_ml" in PREFERRED_NICHES
        assert "game_audio_dev" in PREFERRED_NICHES


class TestRawCandidate:
    def test_valid_candidate(self):
        c = RawCandidate(
            source="test",
            title="Test",
            url="https://example.com",
            snippet="C++ DSP developer needed",
            company="AudioCo",
            tier=2,
        )
        assert c.source == "test"
        assert c.company == "AudioCo"
        assert c.tier == 2
        # raw_text defaults to snippet
        assert c.raw_text == "C++ DSP developer needed"

    def test_raw_text_override(self):
        c = RawCandidate(
            source="test",
            title="Test",
            url="https://example.com",
            snippet="short",
            raw_text="longer detailed text here",
        )
        assert c.raw_text == "longer detailed text here"

    def test_tier_clamping(self):
        c = RawCandidate(
            source="test",
            title="Test",
            url="https://example.com",
            snippet="test",
            tier=10,
        )
        assert c.tier == 5  # clamped down to 5

        c2 = RawCandidate(
            source="test",
            title="Test",
            url="https://example.com",
            snippet="test",
            tier=-1,
        )
        assert c2.tier == 1  # clamped up to 1
