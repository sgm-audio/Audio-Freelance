# Test coverage and quality-gate report

Date: 2026-10-05
Prompt: `docs/prompts/04-test-coverage.md`
Status: local executable cells pass; supported Python/browser/container/desktop matrices remain blocked; NO-GO

## Baseline and final matrix

| Cell | Baseline | Current evidence | Status |
|---|---|---|---|
| Python 3.12 | Not runnable | CI matrix hardened; no assigned runner or local interpreter | Blocked |
| Python 3.13 | Not runnable | CI matrix hardened; no assigned runner or local interpreter | Blocked |
| Python static typing | Not previously established | mypy 2.4.0: 65 files, 0 errors | Pass locally |
| Python package metadata | Not previously established | wheel + sdist built; both pass `twine check` | Pass locally on 3.11 metadata-only check |
| Frontend lint/build | Passed | ESLint and Next production build pass | Pass locally |
| Frontend unit | None | 4 Node test-runner tests, all pass | Pass locally |
| Frontend E2E | 3 smoke tests, not run | 6 deterministic flows compile/list; Chromium download fails before execution | Blocked |
| Outreach | 72 tests passed | Frozen install/build/test previously passed; offline dry-run now also passes | Pass locally |
| Docker/Compose | Not runnable | Separate CI gate designed | Blocked |
| Tauri/Rust | Not runnable | Pinned Rust 1.90.0 and separate format/Clippy/test/build CI gate designed | Blocked |

## Added and strengthened tests

### Frontend unit

`frontend/tests/fetch-json.test.mts` exercises the extracted `JsonClient` without a new test-framework dependency:

- successful GET cache and explicit invalidation;
- concurrent request deduplication;
- HTTP errors are not cached;
- deterministic timeout/abort behavior.

This uses Node 22's test runner and type stripping. No additional vulnerable Vitest dependency was added while the Vitest 4 decision remains deferred.

### Deterministic browser flows

`frontend/e2e/dashboard.spec.ts` now contains six isolated scenarios using Playwright route interception and synthetic data only:

1. backend unavailable state;
2. first-boot redirect, setup completion, and request data typing;
3. lead list/filter/detail/status flow and detail-state reset;
4. upload success, unsupported type, and oversized file UI;
5. theme persistence and hydration-error monitoring;
6. protected briefing denial plus principal navigation/main/heading landmarks.

Traces are retained only on first retry and CI uploads Playwright reports/results only on failure.

### Security and API tests already present

The Python suite includes upload filename sanitization, 10 MiB enforcement, configured API authentication, local-development behavior, production fail-closed configuration, Chroma non-exposure, and `/briefing` authentication coverage. Approval-webhook tests cover missing/invalid/stale HMAC, replay, body limits, weak secrets, and valid state mutation.

## Defects found while constructing gates

- The frontend GET cache did not deduplicate concurrent requests and was not independently testable. It is now encapsulated and tested.
- `saveProfile` did not invalidate the cached empty profile status, allowing setup completion to redirect back to setup. Successful saves now invalidate cache.
- Setup uploads silently ignored invalid file types, oversized files, backend errors, and network failures. The UI now validates type/size and exposes an accessible error message.
- The theme control directly manipulated the DOM and local storage independently of `next-themes`. It now uses `useTheme`, preserving state without provider drift.
- `scripts/outreach-dry-run.mjs` contained a TypeScript non-null assertion in JavaScript and could not execute. The syntax is fixed; the isolated dry-run sends 9 fixture messages, blocks the suppressed fixture, and proves the pause gate.
- Enabling mypy exposed a stale `api.routes.app` import in `test_endpoints.py` and an imprecise launcher file-handle type. Both are corrected; mypy now passes all 65 Python files.
- Python package metadata used a deprecated license table. It now uses the SPDX string `MIT`.

## CI design

`.github/workflows/ci.yml` now provides distinct gates for:

- locked Python lint/format, mypy, and package metadata;
- Python 3.12/3.13 frozen sync, import smoke, pytest, and coverage artifact;
- frontend lint, Node unit tests, and production build;
- frozen outreach build/tests plus an isolated temporary-SQLite dry-run;
- deterministic Playwright Chromium flows with failure-only artifacts;
- pinned Rust format, Clippy with warnings denied, tests, and build;
- container publishing after fast/Python/frontend/Playwright gates.

All third-party actions, including the newly used artifact action, are pinned to full commits.

## Coverage and skip policy

A trustworthy Python coverage baseline cannot be measured without a supported Python runtime. CI records terminal and XML coverage but deliberately does not enforce a fabricated percentage. The threshold must be set no lower than the first successful clean Python 3.12/3.13 baseline.

Existing external-provider and Ollama-dependent skips have explicit reasons. Owner and replacement plan are tracked in issue #74 with review date 2026-11-05. These are not counted as passed integration coverage.

No source-map warning was emitted by the complete pnpm test run. Generated `.next`, package `dist`, test-result, coverage, database, and Rust target artifacts remain ignored and are not committed.

## Exact successful checks

- `npm run lint`
- `npm run test:unit` — 4/4
- `npm run build`
- `npx playwright test --list` — 6 tests compile/list
- `pnpm install --frozen-lockfile`
- `pnpm build`
- `pnpm test` — 72/72 across 10 packages (from the dependency-remediation run)
- isolated `pnpm outreach:dry-run -- --db <temporary path>` — 9 sent, 1 suppressed, pause gate OK
- `mypy .` — 65 files, zero issues
- Python wheel/sdist build and `twine check` — pass
- Ruff checks and frozen uv dev export — pass

## Blocked checks

- Chromium installation fails from Playwright CDN with repeated TLS `ECONNRESET`; E2E execution is not claimed.
- Python 3.12/3.13 acquisition remains blocked by release-asset TLS failures; pytest and measured coverage are not claimed.
- GitHub jobs continue to terminate before runner assignment (issue #73), so CI design has not executed.
- Docker/Compose and Cargo are absent locally; deployment and desktop cells are not claimed.

## Recommendation

**NO-GO.** The executable local cells pass and meaningful deterministic coverage was added, but completion requires actual clean CI runs for Python 3.12/3.13, Playwright Chromium, Docker/Compose, and Rust/Tauri, followed by a measured coverage threshold based on that evidence.
