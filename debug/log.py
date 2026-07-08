"""Structured JSON logging with structlog.

Usage:
    from debug.log import get_logger
    log = get_logger(__name__)
    log.info("prospect_started", niche=niche, tier_count=5)
"""

from __future__ import annotations

import contextvars
import logging
import os
import sys

import structlog
from pythonjsonlogger import jsonlogger


def setup_logging(log_level: str = "INFO") -> None:
    """Configure structlog with JSON output to stdout.

    Call once at startup. Subsequent calls are no-ops.
    """
    if structlog.is_configured():
        return

    level = getattr(logging, log_level.upper(), logging.INFO)

    formatter = jsonlogger.JsonFormatter(
        fmt="%(asctime)s %(name)s %(levelname)s %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%SZ",
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)
    handler.setLevel(level)

    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("chromadb").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)

    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.addHandler(handler)
    root_logger.setLevel(level)

    structlog.configure(
        processors=[
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    """Get a structured logger. If logging isn't configured, set up defaults."""
    if not structlog.is_configured():
        setup_logging(log_level=os.getenv("LOG_LEVEL", "INFO"))
    return structlog.get_logger(name or __name__)


# ── Context helpers ──

_correlation_id: contextvars.ContextVar[str] = contextvars.ContextVar("correlation_id", default="")


def set_correlation_id(cid: str) -> None:
    """Set correlation ID for the current async context."""
    _correlation_id.set(cid)


def get_correlation_id() -> str:
    """Get current correlation ID (empty string if not set)."""
    try:
        return _correlation_id.get()
    except LookupError:
        return ""


def log_with_cid(logger: structlog.stdlib.BoundLogger, **kwargs):
    """Return a logger bound with the current correlation ID."""
    cid = get_correlation_id()
    if cid:
        return logger.bind(correlation_id=cid, **kwargs)
    return logger.bind(**kwargs)
