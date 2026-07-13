"""Tests for Phase 4 diagnostics module."""

import httpx

from debug.diagnostics import (
    DiagnosticReport,
    check_chroma_health,
    check_search_api,
    run_diagnostics,
    sweep_recent_errors,
)


def test_diagnostic_report_has_all_fields():
    """Phase 4: DiagnosticReport includes new Phase 4 fields."""
    report = DiagnosticReport()
    assert hasattr(report, "tavily_reachable")
    assert hasattr(report, "serper_reachable")
    assert hasattr(report, "firecrawl_reachable")
    assert hasattr(report, "chroma_stats")
    assert hasattr(report, "recent_errors")
    assert hasattr(report, "failure_modes")
    assert isinstance(report.failure_modes, list)


def test_check_search_api_unreachable():
    """Phase 4: check_search_api returns False for unreachable host."""
    result = check_search_api("Test", "http://localhost:1/nope", timeout=1)
    assert result is False


def test_check_search_api_reachable(monkeypatch):
    """Phase 4: check_search_api returns True for reachable host (no real network)."""
    monkeypatch.setattr(
        "debug.diagnostics.httpx.get",
        lambda url, timeout: httpx.Response(200, request=httpx.Request("GET", url)),
    )
    result = check_search_api("Test", "https://example.com/get", timeout=10)
    assert result is True


def test_check_chroma_health_returns_dict():
    """Phase 4: check_chroma_health returns a dict with expected keys."""
    result = check_chroma_health()
    assert isinstance(result, dict)
    assert "healthy" in result
    assert "leads" in result


def test_sweep_recent_errors_returns_list():
    """Phase 4: sweep_recent_errors returns a list."""
    result = sweep_recent_errors(hours=1)
    assert isinstance(result, list)


def test_run_diagnostics_returns_dict():
    """Phase 4: run_diagnostics returns a complete report dict."""
    report = run_diagnostics()
    assert "status" in report
    assert "errors" in report
    assert "remediation" in report
    assert "tavily_reachable" in report
    assert "serper_reachable" in report
    assert "firecrawl_reachable" in report
    assert "chroma_stats" in report
    assert "recent_errors" in report
    assert "failure_modes" in report
    assert len(report["failure_modes"]) == 6


def test_failure_modes_are_strings():
    """Phase 4: Each failure mode is a descriptive string."""
    report = run_diagnostics()
    for mode in report["failure_modes"]:
        assert isinstance(mode, str)
        assert len(mode) > 10
