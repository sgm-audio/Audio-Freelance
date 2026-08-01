"""Tests for scoring/signals.py — signal detection patterns."""

from scoring.signals import (
    FIT_SIGNAL_NAMES,
    INTENT_SIGNAL_NAMES,
    POSITIVE_SIGNALS,
    TECH_SIGNAL_NAMES,
    check_hard_skip,
    classify_verdict,
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


class TestBudgetAsIntentAndFit:
    def test_budget_counts_as_intent(self):
        """budget_above_floor should be in INTENT_SIGNAL_NAMES (a dollar amount IS hiring intent)."""
        assert "budget_above_floor" in INTENT_SIGNAL_NAMES

    def test_budget_counts_as_fit(self):
        """budget_above_floor should be in FIT_SIGNAL_NAMES (a dollar amount IS fit)."""
        assert "budget_above_floor" in FIT_SIGNAL_NAMES

    def test_rate_above_floor_counts_as_intent(self):
        """rate_above_floor should be in INTENT_SIGNAL_NAMES."""
        assert "rate_above_floor" in INTENT_SIGNAL_NAMES


class TestStrongTechReachesWarm:
    def test_strong_tech_no_intent_is_warm(self):
        """C++ + DSP + plugin_format (11 tech points) without intent → WARM."""
        signals = {
            "cxx_audio": 3,
            "dsp_any": 3,
            "plugin_format": 5,
        }
        # total 11, tech points 11, no intent → strong-tech path → WARM
        verdict, _status = classify_verdict(signals, 11)
        assert verdict == "WARM"

    def test_weak_tech_no_intent_is_cold(self):
        """Only one tech signal (3 points) without intent → COLD."""
        signals = {"cxx_audio": 3}
        verdict, _status = classify_verdict(signals, 3)
        assert verdict == "COLD"

    def test_strong_tech_below_warm_threshold_is_cold(self):
        """Strong tech but total below warm_threshold → COLD."""
        signals = {
            "cxx_audio": 3,
            "plugin_format": 5,
        }
        # total 8, tech 8, but below warm_threshold of 5? No, 8 >= 5.
        # Use a negative signal to push total below threshold.
        signals["below_floor"] = -15
        verdict, _status = classify_verdict(signals, -7)
        assert verdict == "COLD"
