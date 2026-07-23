"""Tests for scoring/score.py — the main scoring pipeline."""

from leads.schema import LeadStatus
from scoring.profile import Profile
from scoring.profile_score import score_against_profile
from scoring.score import score_candidate
from scoring.signals import classify_verdict, is_aggregator_page
from search.base import RawCandidate


class TestScoreCandidate:
    def test_hot_lead_ml_dsp_remote(self):
        """ML + DSP + remote + budget = HOT (tech + intent + fit)."""
        c = RawCandidate(
            source="test",
            title="ML Audio Engineer needed for CLAP plugin",
            url="https://example.com/job1",
            snippet=(
                "Looking for C++ DSP developer with Mamba/SSM experience "
                "for real-time audio plugin. Remote OK. Budget $5000."
            ),
            tier=1,
        )
        lead = score_candidate(c, "plugin_dev")
        assert lead.verdict == "HOT"
        assert lead.score >= 15
        assert lead.status == LeadStatus.HOT

    def test_warm_lead_reaper(self):
        """REAPER + freelance intent = WARM (tech + intent, no budget)."""
        c = RawCandidate(
            source="test",
            title="REAPER scripting help",
            url="https://example.com/job2",
            snippet="Need a freelance Lua script for REAPER to automate batch rendering.",
            tier=2,
        )
        lead = score_candidate(c, "reaper_scripts")
        assert "reaper_work" in lead.signals
        assert lead.signals["reaper_work"] == 5
        assert lead.verdict == "WARM"

    def test_cold_lead_generic(self):
        """Generic posting with no audio keywords = COLD."""
        c = RawCandidate(
            source="test",
            title="General Python Developer",
            url="https://example.com/job3",
            snippet="Looking for Python developer for web scraping project.",
            tier=1,
        )
        lead = score_candidate(c, "plugin_dev")
        assert lead.verdict == "COLD"
        assert lead.score < 8

    def test_skip_lead_rev_share(self):
        """Revenue share posting = SKIP."""
        c = RawCandidate(
            source="test",
            title="Exciting audio startup",
            url="https://example.com/job4",
            snippet="Join our team! Revenue share only. Build the next generation audio plugin.",
            tier=1,
        )
        lead = score_candidate(c, "plugin_dev")
        assert lead.verdict == "SKIP"
        assert lead.status == LeadStatus.SKIPPED

    def test_skip_lead_equity_only(self):
        """Equity only posting = SKIP."""
        c = RawCandidate(
            source="test",
            title="Cool music AI startup",
            url="https://example.com/job5",
            snippet="Equity only compensation for early stage audio AI company.",
            tier=1,
        )
        lead = score_candidate(c, "audio_ml")
        assert lead.verdict == "SKIP"

    def test_niche_routing(self):
        """Ensure niche is passed through correctly."""
        c = RawCandidate(
            source="test",
            title="Rust Audio Plugin",
            url="https://example.com/job6",
            snippet="Looking for Rust developer with nih-plug experience for CLAP plugin.",
            tier=1,
        )
        lead = score_candidate(c, "rust_audio")
        assert lead.niche == "rust_audio"
        assert lead.verdict in ("HOT", "WARM")

    def test_budget_above_floor(self):
        """Budget above $3000 CAD = +10 points and unlocks HOT with tech+intent."""
        c = RawCandidate(
            source="test",
            title="Well-funded plugin project",
            url="https://example.com/job7",
            snippet="Budget $5000 for C++ CLAP plugin development. Remote friendly.",
            tier=1,
        )
        lead = score_candidate(c, "plugin_dev")
        assert "budget_above_floor" in lead.signals
        assert lead.verdict == "HOT"

    def test_lead_defaults(self):
        """Vague audio mention alone is COLD (no tech + intent)."""
        c = RawCandidate(
            source="test",
            title="Vague posting",
            url="https://example.com/job8",
            snippet="Need some audio work done.",
            tier=3,
        )
        lead = score_candidate(c, "plugin_dev")
        assert lead.verdict == "COLD"

    def test_remote_music_not_hot(self):
        """Generic remote music job must not reach HOT without DSP/plugin tech."""
        c = RawCandidate(
            source="test",
            title="Remote Music Producer — Paid",
            url="https://example.com/job9",
            snippet="Senior remote freelance music producer for mixing and mastering. Paid role.",
            tier=2,
        )
        lead = score_candidate(c, "plugin_dev")
        assert lead.verdict == "COLD"
        assert "ml_neural" not in lead.signals
        assert "plugin_format" not in lead.signals

    def test_aggregator_title_cold(self):
        c = RawCandidate(
            source="test",
            title="234 Freelance Audio Engineer jobs in United States",
            url="https://example.com/agg",
            snippet="Browse jobs",
            tier=2,
        )
        lead = score_candidate(c, "plugin_dev")
        assert lead.verdict == "COLD"
        assert lead.signals.get("aggregator_page") == -50


class TestClassifyVerdict:
    def test_hot_needs_fit(self):
        signals = {
            "cxx_audio": 3,
            "plugin_format": 5,
            "contract_role": 3,
            "remote_pnw": 3,
        }
        # total 14, tech+intent, no fit → WARM not HOT
        assert classify_verdict(signals, 14)[0] == "WARM"

    def test_hot_with_budget(self):
        signals = {
            "cxx_audio": 3,
            "plugin_format": 5,
            "remote_pnw": 3,
            "budget_above_floor": 10,
        }
        assert classify_verdict(signals, 21)[0] == "HOT"

    def test_aggregator_helper(self):
        assert is_aggregator_page("69 jobs in Canada")
        assert is_aggregator_page("Hire the 10 best remote engineers")
        assert not is_aggregator_page("Senior C++ DSP Engineer")


class TestProfileScore:
    def test_aggregator_guard_on_profile_path(self):
        c = RawCandidate(
            source="test",
            title="120 audio jobs across Europe",
            url="https://example.com/agg2",
            snippet="Listing page",
            tier=1,
        )
        lead = score_against_profile(c, "plugin_dev", Profile())
        assert lead.signals.get("aggregator_page") == -50
        assert lead.verdict == "COLD"

    def test_profile_skill_unlocks_hot(self):
        """Tech + intent + profile skill match = HOT without dollar budget."""
        c = RawCandidate(
            source="test",
            title="Contract CLAP developer",
            url="https://example.com/job10",
            snippet="Looking for freelance C++ engineer for CLAP plugin. Remote.",
            tier=1,
        )
        profile = Profile(languages=["c++"], frameworks=["clap"], rate_floor=3000)
        lead = score_against_profile(c, "plugin_dev", profile)
        assert "skills_language_match" in lead.signals or "skills_framework_match" in lead.signals
        assert lead.verdict == "HOT"
