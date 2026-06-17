"""Structured logging setup for the acquisition system."""

import logging
import sys


def setup_logger(name: str, level: str | None = None) -> logging.Logger:
    """Get a logger with consistent formatting.

    Usage:
        from debug.log import setup_logger
        log = setup_logger(__name__)
        log.info("Pipeline started", extra={"niche": niche})
    """
    logger = logging.getLogger(name)

    if level:
        logger.setLevel(getattr(logging, level.upper(), logging.INFO))
    elif not logger.level:
        logger.setLevel(logging.INFO)

    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(logging.Formatter(
            fmt="%(asctime)s  %(levelname)-7s  %(name)s  %(message)s",
            datefmt="%H:%M:%S",
        ))
        logger.addHandler(handler)

    return logger
