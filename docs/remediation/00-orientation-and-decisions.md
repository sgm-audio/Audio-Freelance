# Remediation orientation and decision ledger

Date: 2026-10-05  
Branch: `arena/01a10839-audio-freelance`  
Tracking pull request: #70

## Phase 0 orientation

- Default branch: protected `master`, reviewed at `0aac5ee845797c1ab2a0eec5c6929506e5864426`.
- Active remediation: PR #70, labeled `in progress`.
- GitHub Actions run `37413734389` failed or was cancelled before runner assignment. Runnable jobs had no runner name and no recorded steps; this is infrastructure/account evidence, not a source-test result.
- Detailed Dependabot and secret-scanning alert APIs return HTTP 403 to the configured integration. GitHub exposes only the default-branch aggregate: 66 Dependabot alerts (6 critical, 25 high, 34 moderate, 1 low).
- The repository includes a Python/FastAPI application, a Next.js frontend, a private pnpm outreach workspace, a Tauri/Rust desktop wrapper, container definitions, and GitHub Actions workflows.
- No release exists. Public version declarations are inconsistent; private outreach packages intentionally declare `0.0.0`.

## Maintainer decisions

| Gate | Decision | Implementation consequence |
|---|---|---|
| `/briefing` authentication | Protect in production; preserve explicit local-development behavior. | The route uses the API-key dependency. Production configuration fails closed if `API_KEY` is absent; development may explicitly run without it. |
| Approval webhook | HMAC with timestamp expiry and replay protection. | Sign the exact raw body and Unix timestamp; reject missing/invalid/stale/replayed signatures. |
| Version policy | One application version across public surfaces; private outreach packages stay `0.0.0`. | Align public metadata during release/admin remediation; do not publish private workspace packages. |
| Major dependency upgrades | Approve OAuthlib 4 only. Defer Vitest, Recharts, ESLint, and other majors. | OAuthlib 4 is locked and audited. Remaining major proposals are tracked as deferred risks rather than silently applied. |

## Execution order

The prompts in `docs/prompts/README.md` are executed sequentially. A prompt may record a blocker or deferred risk, but later prompts must not reinterpret the decisions above without maintainer approval.
