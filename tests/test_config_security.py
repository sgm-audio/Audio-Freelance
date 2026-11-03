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
