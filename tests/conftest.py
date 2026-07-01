"""Pytest config: isolate test runs from the production ChromaDB.

Sets LEADS_DATA_DIR to a temp directory and LEADS_ALLOW_TEST_LEADS=1 so
tests can write test-source leads without polluting the real store.
"""

import shutil
import uuid

import pytest


@pytest.fixture(autouse=True)
def isolated_chroma(monkeypatch, tmp_path):
    """Force every test to use an ephemeral ChromaDB directory."""
    test_dir = tmp_path / "chroma"
    test_dir.mkdir(parents=True, exist_ok=True)

    # Unique collection names per test run to prevent cross-test interference
    suffix = uuid.uuid4().hex[:8]
    monkeypatch.setenv("LEADS_DATA_DIR", str(test_dir))
    monkeypatch.setenv("LEADS_ALLOW_TEST_LEADS", "1")
    monkeypatch.setenv("CHROMA_COLLECTION_LEADS", f"test_leads_{suffix}")
    monkeypatch.setenv("CHROMA_COLLECTION_OUTREACH", f"test_outreach_{suffix}")
    monkeypatch.setenv("DEDUP_SIMILARITY_THRESHOLD", "0.92")

    yield

    # Cleanup the temp chroma dir
    shutil.rmtree(test_dir, ignore_errors=True)
