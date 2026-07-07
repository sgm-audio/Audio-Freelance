"""Tests for search layer — tier queries, base utilities, fallback chain."""

import pytest

from search.base import SearchResult, is_block_page, web_search


class TestIsBlockPage:
    def test_cloudflare_detected(self):
        assert is_block_page("Cloudflare Error: Attention Required")

    def test_captcha_detected(self):
        assert is_block_page("Please verify you are human by completing the captcha")

    def test_normal_page_not_blocked(self):
        assert not is_block_page("Normal content about audio plugins and DSP programming")


class TestSearchResult:
    def test_creation(self):
        r = SearchResult(title="Test", url="https://x.com", snippet="hello")
        assert r.source_api == ""
        assert r.title == "Test"


@pytest.mark.asyncio
async def test_web_search_fallback():
    """Test that web_search returns gracefully even with stub keys.

    Since API keys are likely stubs in .env, the fallback chain should
    exhaust and return an empty list rather than raising an exception.
    """
    results = await web_search("C++ DSP plugin contract", max_results=5)
    # Should be list (possibly empty if all APIs have stub keys)
    assert isinstance(results, list)
