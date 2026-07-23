"""Tests for contact_path population and within-run dedup."""

from unittest.mock import AsyncMock, patch

import pytest

from graph.pipeline import dedupe_candidates
from leads.store import canonicalize_url, texts_are_near_dup
from scoring.profile import Profile
from scoring.profile_score import score_against_profile
from scoring.score import score_candidate
from search.ats import fetch_greenhouse_jobs
from search.base import RawCandidate, extract_contact_path


@pytest.fixture
def no_store_dups():
    """Isolate within-run logic from Chroma store state."""
    with patch("graph.pipeline.check_duplicate", return_value=None):
        yield


class TestExtractContactPath:
    def test_mailto(self):
        html = '<a href="mailto:jobs@audioco.com">Apply</a>'
        assert extract_contact_path(html) == "mailto:jobs@audioco.com"

    def test_plain_email(self):
        text = "Send resume to hiring@nativeinstruments.com please."
        assert extract_contact_path(text) == "hiring@nativeinstruments.com"

    def test_skips_noise_email(self):
        text = "tracker@sentry.io and also real@company.com"
        assert extract_contact_path(text) == "real@company.com"

    def test_apply_url_fallback(self):
        assert (
            extract_contact_path("", apply_url="https://boards.greenhouse.io/x/jobs/1")
            == "https://boards.greenhouse.io/x/jobs/1"
        )

    def test_none_when_empty(self):
        assert extract_contact_path("", "   ") is None


class TestScoreContactPath:
    def test_score_candidate_passes_contact_path(self):
        c = RawCandidate(
            source="test",
            title="C++ DSP remote freelance",
            url="https://example.com/job",
            snippet="Budget $5000 for CLAP plugin. Contact careers@pluginco.io",
            tier=1,
        )
        lead = score_candidate(c, "plugin_dev")
        assert lead.contact_path == "careers@pluginco.io"

    def test_score_candidate_uses_pre_set_path(self):
        c = RawCandidate(
            source="test",
            title="C++ DSP remote freelance",
            url="https://example.com/job",
            snippet="Budget $5000 for CLAP plugin development. Remote OK.",
            tier=1,
            contact_path="mailto:hr@preset.com",
        )
        lead = score_candidate(c, "plugin_dev")
        assert lead.contact_path == "mailto:hr@preset.com"

    def test_profile_score_passes_contact_path(self):
        c = RawCandidate(
            source="test",
            title="REAPER scripting help",
            url="https://example.com/job2",
            snippet="Need freelance Lua. Email apply@studio.dev",
            tier=2,
        )
        lead = score_against_profile(c, "reaper_scripts", Profile())
        assert lead.contact_path == "apply@studio.dev"


class TestAtsContactPath:
    @pytest.mark.asyncio
    async def test_greenhouse_sets_contact_from_email(self):
        payload = {
            "jobs": [
                {
                    "title": "Audio DSP Engineer",
                    "absolute_url": "https://boards.greenhouse.io/izotope/jobs/1",
                    "location": {"name": "Remote"},
                    "departments": [{"name": "Engineering"}],
                    "content": (
                        "<p>Build plugins.</p>"
                        '<p>Apply: <a href="mailto:jobs@izotope.com">email</a></p>'
                    ),
                }
            ]
        }

        mock_resp = AsyncMock()
        mock_resp.raise_for_status = lambda: None
        mock_resp.json = lambda: payload

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)

        with patch("search.ats.httpx.AsyncClient", return_value=mock_client):
            jobs = await fetch_greenhouse_jobs("izotope")

        assert len(jobs) == 1
        assert jobs[0].contact_path == "mailto:jobs@izotope.com"

    @pytest.mark.asyncio
    async def test_greenhouse_falls_back_to_apply_url(self):
        payload = {
            "jobs": [
                {
                    "title": "Plugin Engineer",
                    "absolute_url": "https://boards.greenhouse.io/acme/jobs/99",
                    "location": {"name": "NYC"},
                    "departments": [],
                    "content": "<p>No email here, just a description of DSP work.</p>",
                }
            ]
        }

        mock_resp = AsyncMock()
        mock_resp.raise_for_status = lambda: None
        mock_resp.json = lambda: payload

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)

        with patch("search.ats.httpx.AsyncClient", return_value=mock_client):
            jobs = await fetch_greenhouse_jobs("acme")

        assert jobs[0].contact_path == "https://boards.greenhouse.io/acme/jobs/99"


class TestCanonicalizeUrl:
    def test_strips_www_trailing_slash_utm(self):
        assert (
            canonicalize_url(
                "https://WWW.Example.com/jobs/1/?utm_source=x&utm_medium=y"
            )
            == "https://example.com/jobs/1"
        )

    def test_drops_fragment(self):
        assert canonicalize_url("https://example.com/a#section") == "https://example.com/a"

    def test_same_job_different_tracking(self):
        a = canonicalize_url("https://boards.greenhouse.io/x/jobs/1?fbclid=abc")
        b = canonicalize_url("https://boards.greenhouse.io/x/jobs/1")
        assert a == b


class TestTextsNearDup:
    def test_identical(self):
        assert texts_are_near_dup("hello world", "hello world")

    def test_near(self):
        a = "c++ dsp developer needed for clap plugin — remote ok budget 5000"
        b = "c++ dsp developer needed for clap plugin — remote ok budget 5000."
        assert texts_are_near_dup(a, b)

    def test_different(self):
        assert not texts_are_near_dup(
            "c++ dsp audio plugin engineer",
            "python django web developer needed urgently",
        )


class TestWithinRunDedup:
    def test_url_dedup_keeps_first(self, no_store_dups):
        a = RawCandidate(
            source="tier1",
            title="DSP Role",
            url="https://example.com/job/1?utm_source=google",
            snippet="Unique A text about nothing overlapping",
            raw_text="Unique A text about nothing overlapping",
            tier=1,
        )
        b = RawCandidate(
            source="tier2",
            title="DSP Role Mirror",
            url="https://www.example.com/job/1/",
            snippet="Completely different body for semantic path",
            raw_text="Completely different body for semantic path",
            tier=2,
        )
        kept = dedupe_candidates([a, b], "plugin_dev")
        assert len(kept) == 1
        assert kept[0].source == "tier1"

    def test_semantic_dedup_keeps_first(self, no_store_dups):
        body = (
            "Looking for senior C++ DSP engineer to build real-time CLAP plugins "
            "with JUCE. Remote freelance. Budget five thousand."
        )
        a = RawCandidate(
            source="tier1",
            title="Senior C++ DSP Engineer",
            url="https://example.com/a",
            snippet=body,
            raw_text=body,
            tier=1,
        )
        b = RawCandidate(
            source="tier3",
            title="Senior C++ DSP Engineer",
            url="https://other.com/b",
            snippet=body,
            raw_text=body,
            tier=3,
        )
        kept = dedupe_candidates([a, b], "plugin_dev")
        assert len(kept) == 1
        assert kept[0].url == "https://example.com/a"

    def test_distinct_kept(self, no_store_dups):
        a = RawCandidate(
            source="t1",
            title="JUCE Plugin Contract",
            url="https://example.com/1",
            snippet="Need JUCE C++ developer for VST3 plugin. Remote.",
            raw_text="Need JUCE C++ developer for VST3 plugin. Remote.",
            tier=1,
        )
        b = RawCandidate(
            source="t2",
            title="REAPER Lua Automation",
            url="https://example.com/2",
            snippet="Freelance REAPER scripting for batch render pipeline.",
            raw_text="Freelance REAPER scripting for batch render pipeline.",
            tier=2,
        )
        kept = dedupe_candidates([a, b], "plugin_dev")
        assert len(kept) == 2
