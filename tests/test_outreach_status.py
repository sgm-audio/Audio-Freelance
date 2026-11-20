"""Tests for the outreach engine status and kill-switch API."""

import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import config
from api.outreach_status import OutreachDbUnavailableError, load_status, set_paused
from main import app

client = TestClient(app)

SCHEMA = """
CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
CREATE TABLE companies (
  id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, domain TEXT NOT NULL UNIQUE,
  tier INTEGER NOT NULL DEFAULT 0, segment TEXT NOT NULL, source TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE contacts (
  id TEXT PRIMARY KEY NOT NULL, company_id TEXT NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL, role TEXT, email TEXT, linkedin_url TEXT, email_source TEXT
);
CREATE TABLE leads (
  id TEXT PRIMARY KEY NOT NULL, company_id TEXT NOT NULL REFERENCES companies(id),
  contact_id TEXT REFERENCES contacts(id), channel TEXT NOT NULL, state TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
);
CREATE TABLE drafts (
  id TEXT PRIMARY KEY NOT NULL, lead_id TEXT NOT NULL REFERENCES leads(id),
  subject TEXT, body TEXT NOT NULL, personalization_fact_id TEXT, model TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE events (
  id TEXT PRIMARY KEY NOT NULL, lead_id TEXT NOT NULL REFERENCES leads(id),
  from_state TEXT, to_state TEXT NOT NULL, meta TEXT NOT NULL DEFAULT '{}', at TEXT NOT NULL
);
CREATE TABLE suppressions (
  email TEXT PRIMARY KEY NOT NULL, reason TEXT NOT NULL, at TEXT NOT NULL
);
"""

STAMP = "2026-01-01T00:00:00Z"


def create_db(path: Path, *, paused: str | None = None) -> None:
    conn = sqlite3.connect(path)
    try:
        conn.executescript(SCHEMA)
        if paused is not None:
            conn.execute(
                "INSERT INTO settings (key, value) VALUES ('paused', ?)", (paused,)
            )
        conn.execute(
            "INSERT INTO companies VALUES (?, ?, ?, ?, ?, ?, ?)",
            ("c1", "Acme Audio", "acme.audio", 1, "audio", "test", STAMP),
        )
        conn.execute(
            "INSERT INTO contacts VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                "ct1",
                "c1",
                "Jane Doe",
                "Founder",
                None,
                "https://linkedin.com/in/jane",
                None,
            ),
        )
        for lead_id, channel, state, score in [
            ("l1", "linkedin", "PENDING_APPROVAL", 88),
            ("l2", "linkedin", "APPROVED", 90),
            ("l3", "email", "NEW", 30),
            ("l4", "linkedin", "ENRICHED", 40),
        ]:
            conn.execute(
                "INSERT INTO leads VALUES (?, ?, ?, ?, ?, ?, ?)",
                (lead_id, "c1", "ct1", channel, state, score, STAMP),
            )
        for draft_id, lead_id in [("d1", "l1"), ("d2", "l2")]:
            conn.execute(
                "INSERT INTO drafts VALUES (?, ?, ?, ?, ?, ?, ?)",
                (draft_id, lead_id, "Hello", "Real draft body", None, "test", STAMP),
            )
        conn.execute(
            "INSERT INTO events VALUES (?, ?, ?, ?, ?, ?)",
            ("e1", "l1", None, "NEW", "{}", STAMP),
        )
        conn.execute(
            "INSERT INTO suppressions VALUES (?, ?, ?)",
            ("blocked@example.com", "bounce", STAMP),
        )
        conn.commit()
    finally:
        conn.close()


@pytest.fixture
def outreach_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "outreach.sqlite"
    create_db(path, paused="1")
    monkeypatch.setattr(config.settings, "sgm_outreach_db", str(path))
    return path


class TestOutreachStatus:
    def test_missing_database_reports_honest_zeros(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(config.settings, "sgm_outreach_db", str(tmp_path / "none.sqlite"))
        snapshot = load_status()
        assert snapshot["db_exists"] is False
        assert snapshot["source"] == "missing"
        assert snapshot["paused"] is False
        assert set(snapshot["lead_counts"].values()) == {0}
        assert snapshot["totals"]["leads"] == 0
        assert snapshot["pending_approval"] == []

    def test_uninitialized_database_is_labelled(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        path = tmp_path / "empty.sqlite"
        path.touch()
        monkeypatch.setattr(config.settings, "sgm_outreach_db", str(path))
        snapshot = load_status()
        assert snapshot["db_exists"] is True
        assert snapshot["source"] == "sqlite-uninitialized"
        assert snapshot["totals"]["leads"] == 0

    def test_reads_real_counts_and_queues(self, outreach_db: Path) -> None:
        snapshot = load_status()
        assert snapshot["db_exists"] is True
        assert snapshot["source"] == "sqlite"
        assert snapshot["paused"] is True
        assert snapshot["db_path"] == str(outreach_db)
        assert snapshot["lead_counts"]["PENDING_APPROVAL"] == 1
        assert snapshot["lead_counts"]["APPROVED"] == 1
        assert snapshot["lead_counts"]["NEW"] == 1
        assert snapshot["lead_counts"]["ENRICHED"] == 1
        assert snapshot["lead_counts"]["SENT"] == 0
        assert snapshot["totals"] == {
            "companies": 1,
            "contacts": 1,
            "leads": 4,
            "drafts": 2,
            "suppressions": 1,
        }
        assert len(snapshot["funnel"]) == 16
        assert snapshot["pending_approval"][0]["company_name"] == "Acme Audio"
        assert snapshot["pending_approval"][0]["body_preview"] == "Real draft body"
        assert len(snapshot["linkedin_paste_queue"]) == 2
        assert len(snapshot["linkedin_warming"]) == 1
        assert snapshot["linkedin_warming"][0]["state"] == "ENRICHED"

    def test_kill_switch_writes_the_engine_setting(self, outreach_db: Path) -> None:
        assert set_paused(False)["paused"] is False
        conn = sqlite3.connect(outreach_db)
        try:
            value = conn.execute(
                "SELECT value FROM settings WHERE key = 'paused'"
            ).fetchone()[0]
        finally:
            conn.close()
        assert value == "0"
        assert set_paused(True)["paused"] is True

    def test_kill_switch_without_database_is_rejected(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(config.settings, "sgm_outreach_db", str(tmp_path / "none.sqlite"))
        with pytest.raises(OutreachDbUnavailableError, match="not found"):
            set_paused(True)


class TestOutreachApi:
    def test_endpoints_are_protected_and_reflect_real_data(self, outreach_db: Path) -> None:
        original = config.settings.api_key
        config.settings.api_key = "outreach-test-key"
        key = {"Authorization": "Bearer outreach-test-key"}
        try:
            assert client.get("/api/v1/outreach/status").status_code == 401
            status = client.get("/api/v1/outreach/status", headers=key)
            assert status.status_code == 200
            assert status.json()["paused"] is True

            paused = client.post(
                "/api/v1/outreach/pause", headers=key, json={"paused": False}
            )
            assert paused.status_code == 200
            assert paused.json()["paused"] is False

            invalid = client.post(
                "/api/v1/outreach/pause", headers=key, json={"paused": "not-a-boolean"}
            )
            assert invalid.status_code == 422
        finally:
            config.settings.api_key = original

    def test_pause_without_database_returns_503(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(config.settings, "sgm_outreach_db", str(tmp_path / "none.sqlite"))
        response = client.post("/api/v1/outreach/pause", json={"paused": True})
        assert response.status_code == 503
        assert "not found" in response.json()["detail"]
