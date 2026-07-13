"""Pytest config: isolate test runs from the production ChromaDB.

Sets LEADS_DATA_DIR to a temp directory and LEADS_ALLOW_TEST_LEADS=1 so
tests can write test-source leads without polluting the real store.
"""

import os
import shutil
import uuid

import pytest

# ── Set env vars BEFORE any test module imports leads.store ──
# leads/store.py reads LEADS_ALLOW_TEST_LEADS at module level (import time).
# monkeypatch runs too late — we must set os.environ directly here.
_SAVED_ALLOW_TEST = os.environ.get("LEADS_ALLOW_TEST_LEADS")
_SAVED_DATA_DIR = os.environ.get("LEADS_DATA_DIR")
os.environ["LEADS_ALLOW_TEST_LEADS"] = "1"
os.environ["LEADS_DATA_DIR"] = ""  # cleared; fixture sets per-test tmp_path

# config.Settings requires these at import time; supply dummies so the suite
# runs without a .env (e.g. in CI). Real values from the environment still win.
os.environ.setdefault("TAVILY_API_KEY", "test-key")
os.environ.setdefault("SERPER_API_KEY", "test-key")
os.environ.setdefault("FIRECRAWL_API_KEY", "test-key")


def _restore_env():
    """Restore env vars to pre-test values."""
    if _SAVED_ALLOW_TEST is None:
        os.environ.pop("LEADS_ALLOW_TEST_LEADS", None)
    else:
        os.environ["LEADS_ALLOW_TEST_LEADS"] = _SAVED_ALLOW_TEST
    if _SAVED_DATA_DIR is None:
        os.environ.pop("LEADS_DATA_DIR", None)
    else:
        os.environ["LEADS_DATA_DIR"] = _SAVED_DATA_DIR


@pytest.fixture(autouse=True)
def isolated_chroma(monkeypatch, tmp_path):
    """Force every test to use an ephemeral ChromaDB directory."""
    test_dir = tmp_path / "chroma"
    test_dir.mkdir(parents=True, exist_ok=True)

    # Unique collection names per test run to prevent cross-test interference
    suffix = uuid.uuid4().hex[:8]
    monkeypatch.setenv("LEADS_DATA_DIR", str(test_dir))
    monkeypatch.setenv("CHROMA_COLLECTION_LEADS", f"test_leads_{suffix}")
    monkeypatch.setenv("CHROMA_COLLECTION_OUTREACH", f"test_outreach_{suffix}")
    monkeypatch.setenv("DEDUP_SIMILARITY_THRESHOLD", "0.92")

    yield

    # Cleanup the temp chroma dir
    shutil.rmtree(test_dir, ignore_errors=True)


# Register cleanup at session end
@pytest.fixture(scope="session", autouse=True)
def _restore_env_session():
    """Restore env vars after all tests complete."""
    yield
    _restore_env()
