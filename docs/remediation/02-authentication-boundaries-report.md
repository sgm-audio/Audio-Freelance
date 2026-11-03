# Authentication-boundary remediation report

Date: 2026-10-05
Prompt: `docs/prompts/02-authentication-boundaries.md`
Status: implemented; full Python integration verification pending a Python 3.12+ environment

## `/briefing` policy

The maintainer selected production protection with explicit local-development behavior retained.

- `main.py` now attaches `Depends(require_api_key)` to `GET /briefing`.
- `config.py` rejects `ENVIRONMENT=production` unless `API_KEY` is non-empty. Production therefore fails closed during configuration construction rather than silently exposing the route.
- Development continues to support an explicitly empty `API_KEY`, preserving the documented laptop/local workflow.
- `api/auth.py` compares bearer secrets with `secrets.compare_digest`.
- `tests/test_api.py` covers both local open access and configured bearer-token enforcement.
- `tests/test_config_security.py` covers production fail-closed and explicit development behavior.

The health/public API router behavior was not broadened or silently changed.

## Approval webhook contract

`packages/approve/src/webhook.ts` now requires HMAC authentication for state-changing approval requests:

- Secret: `SGM_OUTREACH_APPROVAL_WEBHOOK_SECRET`, minimum 32 characters; the CLI refuses to start the listener otherwise.
- Timestamp header: `X-SGM-Timestamp`, Unix seconds.
- Signature header: `X-SGM-Signature`, formatted as `sha256=<hex>`.
- Signed message: `${timestamp}.${rawBody}` using HMAC-SHA256.
- Freshness: timestamps outside a five-minute window are rejected with HTTP 401.
- Replay defense: an accepted signature is single-use during the freshness window; a duplicate returns HTTP 409. The in-memory cache expires old entries and is capped at 10,000 records.
- Comparison: constant-time after equal-length validation.
- Body limit: 64 KiB; excess returns HTTP 413.
- Error handling: internal exception details are not returned to callers.
- Public endpoint: `GET /health` remains unauthenticated and cannot mutate approval state.

The exact integration contract and limits are documented in `.env.example` and `OUTREACH_RUNBOOK.md`. `signApprovalPayload` is exported for trusted integration tooling.

## Verification evidence

Passed:

- `pnpm --filter @sgm-outreach/approve build`
- `pnpm --filter @sgm-outreach/approve test` — 7 tests passed, including missing/invalid HMAC, valid approval, replay rejection, stale timestamp, body limit, and weak-secret startup rejection.
- `pnpm --filter @sgm-outreach/cli build`
- Ruff lint/format checks for changed Python files.
- Focused configuration and Chroma tests under the available Python 3.11 interpreter — 4 passed. Python 3.11 is used only for these source-compatible focused checks; it is below the supported runtime floor.
- Python bytecode compilation for the changed modules.

Pending:

- `tests/test_api.py` and the complete Python suite under a frozen Python 3.12+ environment. This runner cannot acquire the required interpreter through the available release-assets transport.
- GitHub Actions confirmation; current runs fail before runner assignment.

## Security status

The selected boundaries are implemented and focused TypeScript/configuration checks pass. This prompt is not independently release-cleared until the Python 3.12+ API integration test demonstrates `/briefing` behavior in the frozen application environment.
