"""Tests for scoring/qualify.py — lead qualification for outreach."""

from leads.schema import Lead, LeadStatus, Verdict
from scoring.qualify import qualify_lead, should_pursue


def _lead(
    verdict: Verdict = "WARM",
    score: int = 8,
    contact: str | None = "eng@studio.example",
) -> Lead:
    return Lead(
        source="test",
        title="T",
        url="https://example.com/job",
        raw_text="snippet",
        tier=1,
        niche="plugin_dev",
        verdict=verdict,
        score=score,
        contact_path=contact,
        status=LeadStatus.NEW,
    )


class TestQualifyLead:
    def test_hot_with_contact_is_qualified(self):
        assert qualify_lead(_lead(verdict="HOT", score=21)) == "QUALIFIED"

    def test_warm_with_contact_is_maybe(self):
        assert qualify_lead(_lead(verdict="WARM", score=8)) == "MAYBE"

    def test_cold_is_not_qualified(self):
        assert qualify_lead(_lead(verdict="COLD", score=3)) == "NOT_QUALIFIED"

    def test_skip_is_not_qualified(self):
        assert qualify_lead(_lead(verdict="SKIP", score=0)) == "NOT_QUALIFIED"

    def test_hot_below_hot_threshold_is_maybe(self):
        assert qualify_lead(_lead(verdict="HOT", score=6), hot_threshold=10) == "MAYBE"

    def test_warm_below_warm_threshold_is_not_qualified(self):
        assert qualify_lead(_lead(verdict="WARM", score=4), warm_threshold=5) == "NOT_QUALIFIED"


class TestQualifyContact:
    def test_hot_without_contact_is_maybe(self):
        assert qualify_lead(_lead(verdict="HOT", score=21, contact=None)) == "MAYBE"

    def test_hot_without_contact_qualified_when_not_required(self):
        assert (
            qualify_lead(_lead(verdict="HOT", score=21, contact=None), require_contact=False)
            == "QUALIFIED"
        )

    def test_warm_without_contact_is_maybe(self):
        assert qualify_lead(_lead(verdict="WARM", score=8, contact=None)) == "MAYBE"


class TestShouldPursue:
    def test_qualified_is_pursued(self):
        assert should_pursue(_lead(verdict="HOT", score=21)) is True

    def test_maybe_is_pursued(self):
        assert should_pursue(_lead(verdict="WARM", score=8)) is True

    def test_not_qualified_is_not_pursued(self):
        assert should_pursue(_lead(verdict="COLD", score=3)) is False

    def test_hot_without_contact_still_pursued(self):
        assert should_pursue(_lead(verdict="HOT", score=21, contact=None)) is True

    def test_hot_without_contact_pursued_when_not_required(self):
        assert (
            should_pursue(_lead(verdict="HOT", score=21, contact=None), require_contact=False)
            is True
        )

    def test_below_warm_threshold_not_pursued(self):
        assert should_pursue(_lead(verdict="WARM", score=4), warm_threshold=5) is False
