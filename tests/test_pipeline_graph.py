"""Tests for LangGraph pipeline: Phase 3 orchestration nodes."""

import pytest

from graph.pipeline import (
    await_human_send,
    build_pipeline,
    generate_outreach,
    generate_translate,
    notify_hot,
    queue_for_review,
    search_all,
)
from graph.state import PipelineState


@pytest.fixture
def sample_state() -> PipelineState:
    """Minimal pipeline state with HOT leads for testing."""
    from leads.schema import Lead

    return {
        "niche": "plugin_dev",
        "max_leads_per_tier": 2,
        "tier1_candidates": [],
        "tier2_candidates": [],
        "tier3_candidates": [],
        "tier4_candidates": [],
        "tier5_candidates": [],
        "all_candidates": [],
        "deduped_candidates": [],
        "leads": [],
        "hot_leads": [
            Lead(
                source="test",
                tier=1,
                title="Senior Audio Programmer",
                url="https://example.com/job1",
                raw_text="C++ JUCE VST3 real-time audio development. Contract $50K-$80K.",
                niche="plugin_dev",
                signals={"cxx_audio": 5, "vst3_clap": 5, "real_time": 4},
                score=14,
                verdict="HOT",
            ),
            Lead(
                source="test",
                tier=1,
                title="CLAP Plugin Developer",
                url="https://example.com/job2",
                raw_text="Rust CLAP plugin development. Remote. $40K contract.",
                niche="plugin_dev",
                signals={"rust_audio": 6, "clap": 5},
                score=11,
                verdict="HOT",
            ),
        ],
        "warm_leads": [],
        "cold_leads": [],
        "skipped_leads": [],
        "errors": [],
        "translations": {},
        "outreach_drafts": {},
        "review_queue": [],
        "notified": False,
        "awaiting_approval": False,
    }


@pytest.mark.asyncio
async def test_build_pipeline_returns_graph():
    """Phase 3: build_pipeline() returns a compiled graph."""
    graph = build_pipeline()
    assert graph is not None


@pytest.mark.asyncio
async def test_search_all_node(sample_state):
    """Phase 3: search_all node handles PipelineState."""
    try:
        result = await search_all(sample_state)
        assert isinstance(result, dict)
    except ValueError as e:
        # ChromaDB embedding function init fails without ollama installed
        if "ollama" in str(e).lower():
            pytest.skip("Ollama not available — ChromaDB embedding init skipped")
        raise


@pytest.mark.asyncio
async def test_generate_translate_node(sample_state):
    """Phase 3: generate_translate node produces translations."""
    result = await generate_translate(sample_state)
    assert "translations" in result
    assert isinstance(result["translations"], dict)


@pytest.mark.asyncio
async def test_generate_outreach_node(sample_state):
    """Phase 3: generate_outreach node produces drafts."""
    result = await generate_outreach(sample_state)
    assert "outreach_drafts" in result
    assert isinstance(result["outreach_drafts"], dict)


@pytest.mark.asyncio
async def test_queue_for_review_node(sample_state):
    """Phase 3: queue_for_review builds review queue from HOT leads."""
    sample_state["outreach_drafts"] = {str(sample_state["hot_leads"][0].id): {"draft": "test"}}
    result = await queue_for_review(sample_state)
    assert "review_queue" in result
    assert len(result["review_queue"]) == 2
    assert result["review_queue"][0]["has_draft"] is True
    assert result["review_queue"][1]["has_draft"] is False


@pytest.mark.asyncio
async def test_notify_hot_node(sample_state):
    """Phase 3: notify_hot signals when HOT leads exist."""
    result = await notify_hot(sample_state)
    assert result["notified"] is True


@pytest.mark.asyncio
async def test_notify_hot_empty():
    """Phase 3: notify_hot is False when no HOT leads."""
    state: PipelineState = {
        "niche": "plugin_dev",
        "max_leads_per_tier": 2,
        "tier1_candidates": [],
        "tier2_candidates": [],
        "tier3_candidates": [],
        "tier4_candidates": [],
        "tier5_candidates": [],
        "all_candidates": [],
        "deduped_candidates": [],
        "leads": [],
        "hot_leads": [],
        "warm_leads": [],
        "cold_leads": [],
        "skipped_leads": [],
        "errors": [],
        "translations": {},
        "outreach_drafts": {},
        "review_queue": [],
        "notified": False,
        "awaiting_approval": False,
    }
    result = await notify_hot(state)
    assert result["notified"] is False


@pytest.mark.asyncio
async def test_await_human_send_node(sample_state):
    """Phase 3: await_human_send sets approval flag."""
    result = await await_human_send(sample_state)
    assert result["awaiting_approval"] is True
    assert "message" in result


def test_pipeline_state_fields():
    """Phase 3: PipelineState has all Phase 3 fields."""
    from graph.state import PipelineState

    state: PipelineState = {}
    state["translations"] = {}
    state["outreach_drafts"] = {}
    state["review_queue"] = []
    state["notified"] = False
    state["awaiting_approval"] = False
    assert state["notified"] is False
