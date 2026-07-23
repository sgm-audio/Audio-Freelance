"""Tests for scoring/signals.py — signal detection patterns."""

from scoring.signals import (
    POSITIVE_SIGNALS,
    check_hard_skip,
    extract_signals,
)


class TestCheckHardSkip:
    def test_skip_rev_share(self):
        assert check_hard_skip("We offer revenue share only")

    def test_skip_equity_only(self):
        assert check_hard_skip("equity only compensation")

    def test_skip_unpaid(self):
        assert check_hard_skip("This is an unpaid internship")

    def test_no_skip_legitimate(self):
        assert not check_hard_skip("We are looking for a C++ DSP developer, $5000 contract")

    def test_skip_for_exposure(self):
        assert check_hard_skip("Great opportunity for exposure")

    def test_skip_sweat_equity(self):
        assert check_hard_skip("sweat equity opportunity")


class TestSignalNarrowing:
    def test_paid_alone_not_contract_role(self):
        """Bare 'paid' must not inflate contract_role (was a HOT false-positive path)."""
        hits = extract_signals("Paid remote music role", POSITIVE_SIGNALS)
        assert "contract_role" not in hits

    def test_freelance_is_contract_role(self):
        hits = extract_signals("Seeking freelance C++ DSP help", POSITIVE_SIGNALS)
        assert "contract_role" in hits
        assert "cxx_audio" in hits

    def test_no_audio_context_points(self):
        """Broad audio/music/plugin wording is no longer a scored signal."""
        names = {n for n, _, _ in POSITIVE_SIGNALS}
        assert "audio_context" not in names
