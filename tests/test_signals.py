"""Tests for scoring/signals.py — signal detection patterns."""

from scoring.signals import (
    check_hard_skip,
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
