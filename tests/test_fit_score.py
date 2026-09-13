"""Tests for scoring/fit_score.py — outbound company fit scoring."""

from scoring.fit_score import score_company_fit
from search.base import RawCandidate


def _candidate(snippet: str, title: str = "Acme Audio") -> RawCandidate:
    return RawCandidate(
        source="test",
        title=title,
        url="https://example.com/c",
        snippet=snippet,
    )


class TestScoreCompanyFit:
    def test_real_time_audio_product_signal(self):
        c = _candidate("We build a real-time audio plugin for mixing.")
        assert score_company_fit(c) >= 5

    def test_ml_inference_signal(self):
        c = _candidate("Our stack uses machine learning inference for neural audio.")
        assert score_company_fit(c) >= 5

    def test_small_stage_signal(self):
        c = _candidate("Seed stage startup with a small team looking for a founding engineer.")
        assert score_company_fit(c) >= 5

    def test_technical_content_signal(self):
        c = _candidate("We keep an engineering blog and open-source our DSP code on GitHub.")
        assert score_company_fit(c) >= 3

    def test_all_signals_sum(self):
        c = _candidate(
            "Seed stage startup building a real-time CLAP audio plugin. "
            "We use machine learning for neural amp modeling, small team of 6. "
            "Check our engineering blog and open-source DSP on GitHub."
        )
        assert score_company_fit(c) == 18

    def test_unrelated_company_scores_zero(self):
        c = _candidate("We make accounting software for restaurants.")
        assert score_company_fit(c) == 0
