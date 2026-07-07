"""Tests for research/market.py — market intelligence module."""

from research.market import (
    MarketReport,
    MarketSignal,
    PricingBenchmark,
    TechTrend,
    _parse_rate,
    extract_pricing_benchmarks,
    extract_tech_trends,
)
from research.market import (
    _count_tech_mentions as _extract_tech_mentions,
)


class TestMarketSignal:
    def test_create_signal(self):
        s = MarketSignal(
            category="funding",
            source="test",
            title="AudioCo raises $10M",
            url="https://example.com",
            snippet="Series A for AI audio startup",
            relevance_score=8,
            tags=["funding", "ai-audio"],
        )
        assert s.category == "funding"
        assert s.relevance_score == 8


class TestExtractTechMentions:
    def test_detects_clap(self):
        mentions = _extract_tech_mentions("New CLAP plugin with ARA 2 support")
        assert "CLAP" in mentions
        assert "ARA" in mentions

    def test_detects_mamba_ssm(self):
        mentions = _extract_tech_mentions("Mamba state-space model for audio DSP")
        assert "Mamba/SSM" in mentions

    def test_detects_rust_audio(self):
        mentions = _extract_tech_mentions("nih-plug and clap-rs for Rust audio")
        assert "Rust Audio" in mentions

    def test_detects_reaper(self):
        mentions = _extract_tech_mentions("REAPER reascript SWS extension")
        assert "REAPER" in mentions

    def test_empty_text(self):
        mentions = _extract_tech_mentions("")
        assert mentions == {}

    def test_multiple_mentions(self):
        mentions = _extract_tech_mentions(
            "JUCE CLAP plugin with ONNX inference, using RTNeural and LibTorch"
        )
        assert "JUCE" in mentions
        assert "CLAP" in mentions
        assert "ONNX" in mentions
        assert "RTNeural" in mentions
        assert "LibTorch" in mentions


class TestExtractTechTrends:
    def test_aggregates_mentions(self):
        signals = [
            MarketSignal(
                category="tech_trend",
                source="test",
                title="CLAP gaining traction",
                url="https://x.com",
                snippet="CLAP plugin adoption growing",
            ),
            MarketSignal(
                category="tech_trend",
                source="test",
                title="More CLAP plugins",
                url="https://y.com",
                snippet="Another CLAP plugin released",
            ),
        ]
        trends = extract_tech_trends(signals)
        trends_dict = {t.technology: t for t in trends}
        assert "CLAP" in trends_dict
        assert trends_dict["CLAP"].mention_count >= 2

    def test_empty_signals(self):
        assert extract_tech_trends([]) == []


class TestParseRate:
    def test_contract_range(self):
        r = _parse_rate("Budget $3,000 - $5,000 for C++ DSP")
        assert r == (3000, 5000)

    def test_single_budget(self):
        r = _parse_rate("Budget $5000 for plugin development")
        assert r == (5000, 5000)

    def test_hourly_rate(self):
        r = _parse_rate("$150/hr for audio DSP contract")
        assert r is not None
        assert r[0] >= 3000  # 150 * 20

    def test_no_rate(self):
        assert _parse_rate("Looking for C++ developer") is None

    def test_rate_keyword(self):
        r = _parse_rate("Rate: $8,000 for the full project")
        assert r == (8000, 8000)


class TestExtractPricingBenchmarks:
    def test_plugin_dev_pricing(self):
        signals = [
            MarketSignal(
                category="pricing",
                source="test",
                title="C++ DSP developer needed",
                url="https://x.com",
                snippet="Need a CLAP plugin developer. Budget $5,000.",
            ),
            MarketSignal(
                category="pricing",
                source="test",
                title="VST3 contract",
                url="https://y.com",
                snippet="Looking for VST3 developer. Budget $3,000 - $8,000.",
            ),
        ]
        benchmarks = extract_pricing_benchmarks(signals)
        names = [b.niche for b in benchmarks]
        assert "plugin_dev" in names

    def test_empty_signals(self):
        assert extract_pricing_benchmarks([]) == []


class TestMarketReport:
    def test_default_timestamp(self):
        r = MarketReport()
        assert r.scanned_at is not None

    def test_with_data(self):
        r = MarketReport(
            signals=[
                MarketSignal(
                    category="funding",
                    source="test",
                    title="Test",
                    url="https://x.com",
                    snippet="test",
                )
            ],
            tech_trends=[TechTrend(technology="CLAP", mention_count=3)],
            pricing_benchmarks=[
                PricingBenchmark(niche="plugin_dev", contract_range_max=5000)
            ],
            hot_opportunities=["CLAP is trending"],
            summary="Test report",
        )
        assert len(r.signals) == 1
        assert r.tech_trends[0].technology == "CLAP"
        assert r.summary == "Test report"
