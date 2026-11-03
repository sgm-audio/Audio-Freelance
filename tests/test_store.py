"""Tests for leads/store.py — ChromaDB data layer.

These tests require Ollama to be running with 'nomic-embed-text' pulled.
If Ollama is not available, tests are skipped.
"""

import pytest

from leads.schema import Lead, LeadStatus
from leads.store import (
    check_ollama_available,
    delete_lead,
    embed_text,
    ensure_collections_initialized,
    get_all_leads,
    get_lead_by_id,
    get_leads_by_status,
    search_leads,
    update_status,
    upsert_lead,
)

pytestmark = pytest.mark.skipif(
    not check_ollama_available(),
    reason="Ollama integration unavailable; owner: maintainer; issue #74",
)


@pytest.fixture(autouse=True)
def reset_chroma():
    """Ensure collections are initialized before each test."""
    assert ensure_collections_initialized(), "ChromaDB init failed"
    yield


@pytest.fixture
def sample_lead() -> Lead:
    return Lead(
        source="test",
        tier=1,
        title="Test Lead",
        url="https://example.com/test",
        raw_text="C++ DSP developer needed for CLAP plugin",
        niche="plugin_dev",
    )


class TestEmbedText:
    def test_embed_text_format(self):
        lead = Lead(
            source="test",
            tier=1,
            title="Hello World",
            url="https://x.com",
            raw_text="C++ DSP",
            niche="plugin_dev",
        )
        result = embed_text(lead)
        assert "hello world" in result
        assert "c++ dsp" in result
        assert result == result.lower()
        # No double spaces
        assert "  " not in result


class TestCRUD:
    def test_upsert_and_get_by_id(self, sample_lead):
        upsert_lead(sample_lead)
        fetched = get_lead_by_id(sample_lead.id)
        assert fetched is not None
        assert fetched.title == sample_lead.title
        assert fetched.url == sample_lead.url

    def test_get_all_leads(self, sample_lead):
        upsert_lead(sample_lead)
        all_leads = get_all_leads()
        assert len(all_leads) >= 1
        ids = [str(lead.id) for lead in all_leads]
        assert str(sample_lead.id) in ids

    def test_get_leads_by_status(self, sample_lead):
        # Our sample_lead defaults to NEW
        upsert_lead(sample_lead)
        new_leads = get_leads_by_status(LeadStatus.NEW)
        assert len(new_leads) >= 1
        assert any(str(lead.id) == str(sample_lead.id) for lead in new_leads)

    def test_update_status(self, sample_lead):
        upsert_lead(sample_lead)
        update_status(sample_lead.id, LeadStatus.HOT)
        fetched = get_lead_by_id(sample_lead.id)
        assert fetched is not None
        assert fetched.status == LeadStatus.HOT

    def test_delete_lead(self, sample_lead):
        upsert_lead(sample_lead)
        delete_lead(sample_lead.id)
        fetched = get_lead_by_id(sample_lead.id)
        assert fetched is None

    def test_search_leads(self, sample_lead):
        upsert_lead(sample_lead)
        results = search_leads("C++ DSP plugin")
        assert len(results) >= 1


class TestDedup:
    def test_duplicate_detection(self, sample_lead):
        """Same content should be detected as duplicate."""
        upsert_lead(sample_lead)

        duplicate = Lead(
            source="test",
            tier=1,
            title=sample_lead.title,
            url="https://example.com/other",  # Different URL but same content
            raw_text=sample_lead.raw_text,
            niche=sample_lead.niche,
        )
        from leads.store import check_duplicate

        dup_id = check_duplicate(duplicate)
        # A duplicate should be detected (returns some ID, not None)
        assert dup_id is not None, "Duplicate was not detected!"
        # The returned ID should be a valid UUID string
        assert len(dup_id) > 10

    def test_unique_not_detected(self):
        """Completely different content should NOT be detected as duplicate."""
        lead1 = Lead(
            source="test",
            tier=1,
            title="C++ DSP Developer",
            url="https://example.com/a",
            raw_text="Real-time audio plugin development",
            niche="plugin_dev",
        )
        lead2 = Lead(
            source="test",
            tier=1,
            title="Python Web Developer",
            url="https://example.com/b",
            raw_text=("Building Django web applications with React frontend"),
            niche="plugin_dev",
        )
        upsert_lead(lead1)
        from leads.store import check_duplicate

        dup_id = check_duplicate(lead2)
        # Should NOT be a duplicate (different content)
        assert dup_id is None
