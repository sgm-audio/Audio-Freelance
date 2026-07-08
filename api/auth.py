"""API key authentication dependency.

Usage:
    from api.auth import require_api_key
    @router.get("/leads", dependencies=[Depends(require_api_key)]

If API_KEY env var is not set, auth is disabled (local dev mode).
Set API_KEY in .env to enable authentication for all non-public endpoints.
"""

from fastapi import Header, HTTPException

from config import settings


async def require_api_key(authorization: str | None = Header(None)):
    """Verify Bearer token matches API_KEY env var.

    Skips auth if API_KEY is not configured (local dev mode).
    """
    api_key = settings.api_key
    if not api_key:
        return  # no key configured = open access (local dev)

    if not authorization:
        raise HTTPException(
            status_code=401,
            detail="Missing Authorization header. Use: Authorization: Bearer <key>",
        )

    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or parts[1] != api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")
