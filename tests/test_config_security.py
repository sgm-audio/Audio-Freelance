"""Security invariants for deployment configuration."""

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

import config
from config import Settings, write_search_keys

_REQUIRED = {
    "tavily_api_key": "test",
    "serper_api_key": "test",
    "firecrawl_api_key": "test",
    "_env_file": None,
}


def test_production_requires_api_key():
    with pytest.raises(ValidationError, match="API_KEY is required"):
        Settings(environment="production", api_key="", **_REQUIRED)


def test_local_development_may_explicitly_disable_auth():
    settings = Settings(environment="development", api_key="", **_REQUIRED)
    assert settings.api_key == ""


def test_local_development_boots_without_search_keys():
    settings = Settings(
        environment="development",
        api_key="",
        tavily_api_key="",
        serper_api_key="",
        firecrawl_api_key="",
        _env_file=None,
    )
    assert settings.missing_search_keys() == [
        "tavily_api_key",
        "serper_api_key",
        "firecrawl_api_key",
    ]


def test_production_still_requires_api_key():
    with pytest.raises(ValidationError, match="API_KEY is required"):
        Settings(
            environment="production",
            api_key="",
            tavily_api_key="tav",
            serper_api_key="ser",
            firecrawl_api_key="fir",
            _env_file=None,
        )


def test_config_status_shape():
    """GET /api/v1/config/status returns booleans only, never key values."""
    from main import app

    client = TestClient(app)
    data = client.get("/api/v1/config/status").json()
    assert set(data) == {"tavily", "serper", "firecrawl"}
    assert all(isinstance(value, bool) for value in data.values())


def test_write_search_keys_persists_and_reloads(tmp_path, monkeypatch):
    """write_search_keys writes UPPERCASE keys to .env and reloads settings live."""
    for key in ("TAVILY_API_KEY", "SERPER_API_KEY", "FIRECRAWL_API_KEY"):
        monkeypatch.delenv(key, raising=False)
    env_path = tmp_path / ".env"
    original_settings = config.settings
    try:
        write_search_keys(
            {"tavily_api_key": "tvly-test-key-1234567890abcdef"}, env_path=env_path
        )
        env_text = env_path.read_text(encoding="utf-8")
        assert "TAVILY_API_KEY=tvly-test-key-1234567890abcdef" in env_text
        # Reloaded settings read the new key live (no env-var pollution).
        reloaded = Settings(_env_file=env_path)
        assert reloaded.tavily_api_key == "tvly-test-key-1234567890abcdef"
        assert reloaded.missing_search_keys() == [
            "serper_api_key",
            "firecrawl_api_key",
        ]
    finally:
        config.settings = original_settings


def test_write_search_keys_deduplicates(tmp_path):
    """Duplicate search-key lines (any case) collapse to the last occurrence."""
    env_path = tmp_path / ".env"
    env_path.write_text(
        "TAVILY_API_KEY=first\ntavily_api_key=second\nOTHER=keep\n",
        encoding="utf-8",
    )
    original_settings = config.settings
    try:
        write_search_keys({}, env_path=env_path)
        env_text = env_path.read_text(encoding="utf-8")
        assert env_text.count("TAVILY_API_KEY=") == 1
        assert "TAVILY_API_KEY=second" in env_text
        assert "OTHER=keep" in env_text
    finally:
        config.settings = original_settings


def test_write_search_keys_refused_in_production():
    """Writing keys is refused when ENVIRONMENT=production (fail-closed)."""
    original_settings = config.settings
    prod = Settings(
        environment="production",
        api_key="prod-key",
        tavily_api_key="",
        serper_api_key="",
        firecrawl_api_key="",
        _env_file=None,
    )
    config.settings = prod
    try:
        with pytest.raises(PermissionError, match="production"):
            write_search_keys({"tavily_api_key": "x"})
    finally:
        config.settings = original_settings
