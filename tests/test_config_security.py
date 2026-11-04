"""Security invariants for deployment configuration."""

import pytest
from pydantic import ValidationError

from config import Settings

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
