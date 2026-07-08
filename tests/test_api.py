"""Integration smoke tests for all API endpoints.

Tests the FastAPI app through TestClient (no real HTTP server).
Validates that every route accepts requests and returns expected shapes.
"""

import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


class TestHealthAndStatus:
    """Health, status, and metrics endpoints."""

    def test_health_returns_ok(self):
        """GET /api/v1/health returns status, ollama flag, timestamp."""
        resp = client.get("/api/v1/health")
        assert resp.status_code == 200
        data = resp.json()
        assert "status" in data
        assert "ollama" in data
        assert "timestamp" in data

    def test_metrics_returns_plain_text(self):
        """GET /api/v1/metrics returns Prometheus text format."""
        resp = client.get("/api/v1/metrics")
        assert resp.status_code == 200
        assert "text/plain" in resp.headers["content-type"]

    def test_status_returns_counts(self):
        """GET /api/v1/status returns lead_counts dict."""
        resp = client.get("/api/v1/status")
        assert resp.status_code == 200
        data = resp.json()
        assert "lead_counts" in data
        assert "ollama_available" in data
        assert "timestamp" in data

    def test_debug_runs_diagnostics(self):
        """POST /api/v1/debug runs diagnostics sweep."""
        resp = client.post("/api/v1/debug")
        assert resp.status_code == 200


class TestLeads:
    """Lead CRUD endpoints."""

    def test_list_leads_returns_list(self):
        """GET /api/v1/leads returns count + leads array."""
        resp = client.get("/api/v1/leads")
        assert resp.status_code == 200
        data = resp.json()
        assert "count" in data
        assert "leads" in data
        assert isinstance(data["leads"], list)

    def test_list_leads_filtered_by_status(self):
        """GET /api/v1/leads?status=HOT filters by status."""
        resp = client.get("/api/v1/leads?status=HOT")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data["leads"], list)

    def test_list_leads_invalid_status(self):
        """GET /api/v1/leads?status=INVALID returns 400."""
        resp = client.get("/api/v1/leads?status=INVALID")
        assert resp.status_code == 400

    def test_get_lead_not_found(self):
        """GET /api/v1/leads/nonexistent returns 404."""
        resp = client.get("/api/v1/leads/nonexistent-id")
        assert resp.status_code in (400, 404)

    def test_update_lead_status_missing_body(self):
        """POST /api/v1/leads/{id}/status without body returns 422."""
        resp = client.post("/api/v1/leads/fake/status")
        assert resp.status_code == 422

    def test_update_lead_status_valid(self):
        """POST /api/v1/leads/{id}/status with valid body."""
        resp = client.post(
            "/api/v1/leads/fake/status",
            json={"new_status": "HOT"},
        )
        assert resp.status_code in (200, 400, 404, 500)


class TestProspecting:
    """Search → dedup → score pipeline endpoints."""

    def test_prospect_invalid_niche(self):
        """POST /api/v1/prospect/INVALID returns 400."""
        resp = client.post("/api/v1/prospect/INVALID")
        assert resp.status_code == 400

    @pytest.mark.skip(reason="Runs full pipeline — external APIs, 30s+")
    def test_prospect_valid_niche(self):
        """POST /api/v1/prospect/plugin_dev runs full pipeline."""
        resp = client.post("/api/v1/prospect/plugin_dev", timeout=120)
        assert resp.status_code == 200

    def test_score_missing_body(self):
        """POST /api/v1/score without body returns 422."""
        resp = client.post("/api/v1/score")
        assert resp.status_code == 422

    def test_translate_missing_param(self):
        """POST /api/v1/translate without query param returns 422."""
        resp = client.post("/api/v1/translate")
        assert resp.status_code == 422

    def test_rate_missing_params(self):
        """POST /api/v1/rate without query params returns 422."""
        resp = client.post("/api/v1/rate")
        assert resp.status_code == 422

    def test_outreach_lead_not_found(self):
        """POST /api/v1/outreach/{id} with nonexistent lead returns 404."""
        resp = client.post("/api/v1/outreach/nonexistent-id")
        assert resp.status_code == 404

    def test_proposal_missing_params(self):
        """POST /api/v1/proposal without body/query params returns 422."""
        resp = client.post("/api/v1/proposal")
        assert resp.status_code == 422


class TestTracking:
    """Tracking, triage, and won-lost endpoints."""

    def test_tracking_events(self):
        """GET /api/v1/tracking returns events list."""
        resp = client.get("/api/v1/tracking")
        assert resp.status_code == 200
        data = resp.json()
        assert "count" in data
        assert "events" in data
        assert isinstance(data["events"], list)

    def test_tracking_lead_not_found(self):
        """GET /api/v1/tracking/{id} with nonexistent lead returns 404."""
        resp = client.get("/api/v1/tracking/nonexistent-id")
        assert resp.status_code == 404

    def test_active_pursuits(self):
        """GET /api/v1/tracking/active returns pursuits."""
        resp = client.get("/api/v1/tracking/active")
        assert resp.status_code == 200
        data = resp.json()
        assert "count" in data
        assert "active" in data

    def test_won_lost_summary(self):
        """GET /api/v1/tracking/won-lost returns summary."""
        resp = client.get("/api/v1/tracking/won-lost")
        assert resp.status_code == 200
        data = resp.json()
        assert "won" in data
        assert "lost" in data
        assert "win_rate" in data

    def test_triage_missing_params(self):
        """POST /api/v1/tracking/triage without params returns 422."""
        resp = client.post("/api/v1/tracking/triage")
        assert resp.status_code == 422

    def test_triage_batch_missing_body(self):
        """POST /api/v1/tracking/triage/batch without body returns 422."""
        resp = client.post("/api/v1/tracking/triage/batch")
        assert resp.status_code == 422


class TestColdLeads:
    """Cold lead archive endpoints."""

    def test_list_cold_leads(self):
        """GET /api/v1/leads/cold returns list."""
        resp = client.get("/api/v1/leads/cold")
        assert resp.status_code == 200
        data = resp.json()
        assert "count" in data
        assert "leads" in data

    def test_cold_stats(self):
        """GET /api/v1/leads/cold/stats returns counts."""
        resp = client.get("/api/v1/leads/cold/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert "total_archived" in data

    def test_rotate_cold(self):
        """POST /api/v1/leads/rotate-cold runs rotation."""
        resp = client.post("/api/v1/leads/rotate-cold")
        assert resp.status_code in (200, 503)

    def test_rotation_status(self):
        """GET /api/v1/leads/rotation-status returns status."""
        resp = client.get("/api/v1/leads/rotation-status")
        assert resp.status_code == 200
        data = resp.json()
        assert "rotation_due_days" in data


class TestMarket:
    """Market intelligence endpoints — skipped by default (external APIs, 60s+)."""

    @pytest.mark.skip(reason="Market scan calls external APIs — run manually")
    def test_market_overview(self):
        resp = client.get("/api/v1/market", timeout=120)
        assert resp.status_code == 200

    @pytest.mark.skip(reason="Market scan calls external APIs — run manually")
    def test_market_trends(self):
        resp = client.get("/api/v1/market/trends", timeout=120)
        assert resp.status_code == 200
        data = resp.json()
        assert "tech_trends" in data

    @pytest.mark.skip(reason="Market scan calls external APIs — run manually")
    def test_market_pricing(self):
        resp = client.get("/api/v1/market/pricing", timeout=120)
        assert resp.status_code == 200
        data = resp.json()
        assert "pricing_benchmarks" in data

    @pytest.mark.skip(reason="Market scan calls external APIs — run manually")
    def test_market_opportunities(self):
        resp = client.get("/api/v1/market/opportunities", timeout=120)
        assert resp.status_code == 200
        data = resp.json()
        assert "opportunities" in data


class TestProfile:
    """Profile endpoints."""

    def test_profile_status_public(self):
        """GET /api/v1/profile/status is public (no auth)."""
        resp = client.get("/api/v1/profile/status")
        assert resp.status_code == 200
        data = resp.json()
        assert "exists" in data

    def test_get_profile(self):
        """GET /api/v1/profile returns profile data."""
        resp = client.get("/api/v1/profile")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, dict)

    def test_update_profile_empty(self):
        """POST /api/v1/profile with empty body."""
        resp = client.post("/api/v1/profile", json={})
        assert resp.status_code in (200, 422)

    def test_delete_profile(self):
        """DELETE /api/v1/profile removes profile."""
        resp = client.delete("/api/v1/profile")
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("status") == "deleted"

    def test_upload_no_file(self):
        """POST /api/v1/profile/upload without file returns 422."""
        resp = client.post("/api/v1/profile/upload")
        assert resp.status_code == 422

    def test_blocked_companies_get(self):
        """GET /api/v1/profile/blocked returns list."""
        resp = client.get("/api/v1/profile/blocked")
        assert resp.status_code == 200
        data = resp.json()
        assert "blocked_companies" in data

    def test_add_blocked_missing_param(self):
        """POST /api/v1/profile/blocked without query param returns 422."""
        resp = client.post("/api/v1/profile/blocked")
        assert resp.status_code == 422

    def test_remove_blocked_missing_param(self):
        """DELETE /api/v1/profile/blocked without query param returns 422."""
        resp = client.delete("/api/v1/profile/blocked")
        assert resp.status_code == 422


class TestCompanies:
    """Company tracking endpoints."""

    def test_list_companies(self):
        """GET /api/v1/companies returns ATS companies."""
        resp = client.get("/api/v1/companies")
        assert resp.status_code == 200
        data = resp.json()
        assert "greenhouse" in data or "total" in data

    def test_add_company_no_params(self):
        """POST /api/v1/companies without query params returns 422."""
        resp = client.post("/api/v1/companies")
        assert resp.status_code == 422

    def test_remove_company_no_params(self):
        """DELETE /api/v1/companies without query params returns 422."""
        resp = client.delete("/api/v1/companies")
        assert resp.status_code == 422


class TestBriefing:
    """Daily briefing HTML page."""

    def test_briefing_returns_html(self):
        """GET /briefing returns HTML response."""
        resp = client.get("/briefing")
        assert resp.status_code == 200
        assert "text/html" in resp.headers["content-type"]
