# Repository Review Report: Audio-Freelance

**Review date:** 2026-10-04  
**Branch:** `arena/01a10839-audio-freelance`  
**Base:** `0aac5ee845797c1ab2a0eec5c6929506e5864426`

## Summary

Audio-Freelance is a substantial, generally well-organized polyglot application: a Python/FastAPI lead pipeline, a Next.js dashboard, a pnpm/TypeScript outreach workspace, and an optional Tauri shell. The strongest areas are the breadth of automated backend/outreach tests, typed outreach packages, lockfiles, security policy, and operational documentation. The review found two immediately actionable deployment/dependency exposures, a broken frontend lint baseline, one stale outreach test, incomplete CI coverage, and several documentation claims that no longer matched the tree.

The most serious reachable issue was an unused, unauthenticated Chroma HTTP service published on host port 8001 even though the backend exclusively uses `chromadb.PersistentClient`. Published Chroma server advisories include pre-authentication code injection. The service and dead `CHROMA_HOST` configuration were removed. Next.js 16.2.9 also had published critical RCE advisories and was upgraded to 16.3.8. Production npm dependencies now audit cleanly. Remaining risk is concentrated in transitive Python packages, build-time npm tooling, unauthenticated optional/operator endpoints, and deployment images/actions that are version-tagged rather than digest/SHA-pinned.

### Baseline

- **Python build/tests:** not executable locally because `uv` was absent and the sandbox could not download a required Python 3.12/3.13 runtime due TLS/network failures. The checkout requires Python 3.12+, while only 3.11 was installed. Python byte-compilation was possible.
- **Python lint:** initially blocked by missing `uv`; later baseline/current source passed Ruff.
- **Frontend build:** passed on Next.js 16.2.9.
- **Frontend lint:** failed with **17 errors and 3 warnings**.
- **Outreach build:** passed after compiling native `better-sqlite3` against local Node headers.
- **Outreach tests:** **1 failed, 71 passed**; `packages/core/tests/claims.test.ts` had a stale exact list after claims were added.
- **Dependency audit:** frontend reported **1 critical, 13 high, 2 moderate** findings; Python lock audit reported vulnerable packages including ChromaDB, AnyIO, urllib3, aiohttp, LangSmith, OAuthlib, and pydantic-settings.
- **Launcher check:** correctly failed for absent `uv`, `.env`, and frontend dependencies.

### Final

- **Python:** Ruff passes; `compileall` passes; `uv export --frozen` validates lock syntax. The pytest suite remains **not locally verified** because no compatible Python runtime could be downloaded. CI is expected to perform the authoritative 3.12/3.13 run.
- **Frontend:** `npm ci`, ESLint, TypeScript/Next.js production build all pass on Next.js 16.3.8. `npm audit --omit=dev` reports **0 vulnerabilities**.
- **Outreach:** all ten packages build and all **72 Vitest tests pass**. Stale source-map warnings were removed.
- **E2E:** not locally verified because the Playwright Chromium download repeatedly failed at TLS setup.
- **Desktop/Docker:** not locally built because Rust/Cargo and Docker are unavailable in the sandbox.
- **Counts:** **24 findings / 15 fixed / 9 escalated / 20 items labeled** (17 GitHub PRs and 3 documentation sections).

## Critical Findings (act immediately)

1. **FIXED — exposed Chroma server with published pre-auth code-injection advisories.** `docker-compose.yml` published an unauthenticated `chromadb/chroma:latest` service on `:8001`. The application never reads `CHROMA_HOST`; `leads/store.py` uses only embedded `chromadb.PersistentClient`. The unused service, port, dependency, volume, and production override were removed. Do not reintroduce a network Chroma server until a fixed release is available and authentication/network isolation are designed.
2. **FIXED — vulnerable Next.js runtime.** `frontend/package-lock.json` resolved Next.js 16.2.9, affected by multiple advisories including critical unauthenticated RCE. It now resolves 16.3.8; lint/build pass and production npm audit is clean.
3. **No committed secrets found.** Working-tree pattern scans found no private keys or recognizable provider/GitHub tokens. GitHub secret-scanning results could not be queried because the integration returned HTTP 403. The available checkout is shallow/grafted, so this is not a guarantee about full history.

## Changes Applied

| # | Category | File(s) | Description | Commit/PR |
|---|---|---|---|---|
| 1 | Security/deployment | `docker-compose*.yml`, `Dockerfile` | Removed unused exposed Chroma server; fixed backend container binding and `.env` propagation. | `e92b6ec` |
| 2 | Dependencies | `frontend/package*.json`, `uv.lock` | Upgraded Next.js/eslint config; moved build-only shadcn CLI to dev dependencies; applied patched AnyIO/urllib3 locks. | `e92b6ec` |
| 3 | Input security | `api/routes.py`, `tests/test_api.py` | Sanitized upload names, bounded streamed writes to 10 MiB, removed partial files, and added regression tests. | `e92b6ec` |
| 4 | CI/scaffolding | `.github/workflows/ci.yml`, `Makefile` | Added frontend lint and outreach build/tests; made install/check scripts self-contained. | `c42f0a2` |
| 5 | Hygiene | `.gitattributes`, `.github/CODEOWNERS`, `.env.example`, `pyproject.toml` | Added line-ending/binary policy and ownership; completed backend env sample; corrected package README metadata. | `c42f0a2` |
| 6 | Frontend quality | `frontend/src/**` | Resolved all ESLint errors/warnings, removed dead code, improved hydration handling, and corrected types/navigation. | `c42f0a2` |
| 7 | Test quality | `packages/core/tests/claims.test.ts` | Replaced brittle exact claim-list assertion with required-membership and uniqueness checks. | `c42f0a2` |
| 8 | Documentation | `README.md`, `AGENTS.md`, `frontend/README.md`, `CHANGELOG.md` | Corrected nonexistent Windows scripts, API behavior, test claims, CI scope, routes, environment variables, and search tiers. | `af2d15a` |
| 9 | Status labeling | `BACKLOG.md`, `OUTREACH_REVIEW.md`, benchmarks README | Added explicit `in progress`/`research` markers to incomplete or validation-dependent work. | `af2d15a` |
| 10 | Hygiene/noise | six TypeScript source files | Removed stale generated `sourceMappingURL` directives that referenced nonexistent adjacent maps. | `b661da4` |

## Findings Requiring Human Decision

| # | Category | Location | Finding | Risk | Recommendation |
|---|---|---|---|---|---|
| 1 | Dependency security | `uv.lock` (`chromadb==1.5.9`) | Pip-audit reports pre-auth/auth code-injection and tenant-authorization advisories with no fixed version. Embedded use does not expose Chroma's HTTP API, but the dependency remains. | High if an HTTP server is reintroduced; lower for current embedded use | Monitor upstream, pin the first fixed release, and prohibit exposing Chroma over the network meanwhile. |
| 2 | Dependency security | `uv.lock` | Remaining advisories affect aiohttp 3.14.1, LangSmith 0.8.16, OAuthlib 3.3.1, and pydantic-settings 2.14.1. Most are transitive and some vulnerable features are not used. | Medium | Validate and update patch releases; treat OAuthlib 4 as a reviewed major upgrade. Dependabot PR #68 is labeled `research`. |
| 3 | Build-tool security | frontend dev dependencies | `npm audit` reports 9 high findings through `shadcn`/`fast-glob`/`braces`; production (`--omit=dev`) is clean and npm offers only a breaking shadcn downgrade. | Medium operational/build risk | Track upstream fixes; do not use forced downgrade without testing. |
| 4 | Authentication | `main.py:156-190` | `/briefing` reads lead data but sits outside the authenticated API router, even when `API_KEY` is configured. | Medium information disclosure on hosted deployments | Decide whether it is intentionally public; if not, apply the same auth dependency. Authentication changes were not made automatically. |
| 5 | Authentication | `packages/approve/src/webhook.ts:27-79` | Approval webhook accepts state-changing POSTs without a shared secret. Loopback default limits exposure, but tunneling/binding externally allows unauthorized approvals. | High if exposed | Add signed/shared-secret authentication before any non-loopback deployment; item remains `research`. |
| 6 | Supply chain/deployment | Compose, Dockerfiles, workflows | Runtime images use mutable `latest` tags and Actions use major tags rather than commit SHAs; `setup-flyctl@master` is especially mutable. | Medium | Pin image digests and action SHAs through a deliberate update policy. |
| 7 | Test coverage | `frontend/e2e`, CI | Three Playwright smoke tests exist but are not in CI; there is no component/unit suite. | Medium regression risk | Add a separate browser-smoke job once runtime/download cost is accepted; add focused tests for API client/error states. |
| 8 | Release/versioning | `pyproject.toml`, frontend/desktop/package manifests | Python is 0.1.2, frontend/desktop 0.1.0, outreach packages 0.0.0, and no repository tags are present in the checkout despite releases. Private package versions may be intentional. | Low | Document independent-version policy or establish one release source of truth. |
| 9 | Repository administration | remote branches/history/security APIs | Many old feature/dependabot branches remain; full-history blob/secret review and GitHub security alerts were not accessible from this shallow checkout/integration. | Low/unknown | Maintainer should prune merged branches and review Dependabot/code/secret scanning in GitHub with appropriate permissions. |

## Label Changes

| Item | Previous Label | New Label | Reason |
|---|---|---|---|
| PRs #49, #50, #51, #52, #53, #54, #55, #56, #60, #61, #62, #63, #66, #67, #69 | missing/inconsistent `dependencies`; no state label | `dependencies`, `in progress` | All are active Dependabot updates with failing/incomplete validation; missing dependency labels were corrected. |
| PR #65 (Vitest 4 major) | `dependencies`, `javascript` | + `in progress`, `research` | Major toolchain update needs compatibility validation. |
| PR #68 (OAuthlib 4 major) | `dependencies`, `python:uv` | + `in progress`, `research` | Security-relevant major update needs impact validation. |
| `BACKLOG.md` pending section | no inline status | `in progress` | Explicitly lists unfinished implementation/ops tasks. |
| `OUTREACH_REVIEW.md` blockers | no inline status | `research` | Authentication design and live-provider validation require decisions. |
| benchmark README | title said in progress only | `in progress` marker | Measurements have not been run/published. |

Two repository labels were created: `in progress` and `research`.

## Detailed Findings by Dimension

### 1. Hygiene

- **Critical / fixed:** unused unauthenticated Chroma container and host port removed; embedded storage remains (`leads/store.py:137-145`).
- **Medium / fixed:** missing `.gitattributes` added with LF normalization and binary declarations.
- **Low / fixed:** default `CODEOWNERS` added for the sole primary maintainer.
- **Low / fixed:** stale source-map directives removed from six TypeScript source files.
- **Low / fixed:** `.env.example` now includes all backend server/path variables read by `config.py`.
- **Medium / proposed:** mutable container/action tags should be digest/SHA pinned.
- **Research:** no suspicious tracked artifacts or oversized blobs were found in the available snapshot; largest tracked file is the 685 KiB `uv.lock`. Full historical analysis is unavailable because the clone is grafted/shallow.
- **License:** MIT is consistent between `LICENSE`, GitHub metadata, and `pyproject.toml`.

### 2. Documentation

- **Medium / fixed:** README referenced nonexistent `run.bat`, `activate.ps1`, and `activate.bat`; Windows instructions now use `python run.py`/`uv run`.
- **Medium / fixed:** API table claimed `/briefing` was plain text and documented a nonexistent `/dispatch`; corrected to the actual HTML endpoint and removed `/dispatch`.
- **Low / fixed:** documented test counts, CI scope, missing frontend tests, frontend pages, fifth search tier, and Docker behavior were reconciled with code.
- **Low / fixed:** changelog's unreleased section incorrectly claimed wrapper files, `/metrics`, and tag-triggered Docker publishing; corrected without rewriting released entries.
- **Low / fixed:** Python package metadata now uses the user-facing `README.md` rather than `BUILD_PLAN.md`.
- **Pass:** local Markdown link validation found no broken repository-relative links.
- **Research:** external links were not exhaustively crawled because outbound TLS was unreliable.

### 3. Scaffolding

- **High / fixed:** CI did not lint the frontend or build/test the pnpm workspace; both are now jobs/steps (`.github/workflows/ci.yml:62-88`).
- **Medium / fixed:** `make install` omitted Python's dev extra and `make check` required a global Ruff; both now use reproducible uv commands.
- **High / fixed:** Docker backend defaulted to loopback and Compose did not pass `.env`; container traffic could not reliably reach FastAPI and required settings were absent. It now binds `0.0.0.0` in containers and consumes `.env`.
- **Medium / proposed:** Docker and Tauri builds were not locally verifiable because tooling is absent.
- **Medium / proposed:** Playwright smoke tests are not CI-enforced.
- **Low / proposed:** Docker job still contains a tag condition that cannot be reached under the workflow's branch-only push filter; CD handles tags separately, so this is currently harmless but confusing.

### 4. Code Quality

- **Medium / fixed:** frontend lint baseline had 20 findings. Internal navigation now uses `Link`, unsafe `any` and unused values were removed, effect dependencies were corrected, and hydration handling uses appropriate React behavior.
- **Medium / fixed:** outreach claims test coupled itself to an obsolete exact list; it now checks mandatory claims, uniqueness, and allowlist coverage.
- **Low / fixed:** six checked-in TS source-map comments pointed to files that do not exist and caused repeated Vitest warnings.
- **Medium / proposed:** `api/routes.py` (1,000+ lines), `packages/core/src/repo.ts` (500+), and `leads/store.py` (500+) are maintenance hotspots. Refactoring is architectural and was not attempted.
- **Low / proposed:** Recharts 2.x and ESLint 9.x report upstream deprecation notices; upgrades are major and should be planned, not forced.

### 5. Bugs & Correctness

- **Critical / fixed:** vulnerable Next.js runtime upgraded; production audit now clean.
- **High / fixed:** profile upload trusted client filename structure and metadata-only size checks. It now normalizes separators, writes in bounded chunks, and cleans partial files (`api/routes.py:886-929`).
- **High / fixed:** public Chroma service was both unused and hazardous; removed from deployment.
- **High / fixed:** backend container bound to loopback and missed required env configuration; corrected.
- **Medium / fixed:** stale claim expectation caused the outreach suite to fail; all 72 tests now pass.
- **High / research:** approval webhook lacks authentication (`packages/approve/src/webhook.ts:27-79`).
- **Medium / research:** briefing endpoint bypasses configured bearer auth (`main.py:156-190`).
- **Medium / research:** remaining Python and dev-tool advisories need dependency-impact review.

## Recommended Next Steps

1. **Before any hosted deployment:** confirm `/briefing` auth policy and add authentication/signing to the approval webhook before exposing it beyond loopback.
2. **Dependency pass:** update aiohttp, LangSmith, and pydantic-settings patch releases; review OAuthlib 4; monitor Chroma for fixed releases. Re-run `pip-audit` and the complete Python suite.
3. **Run CI on this branch/PR:** Python 3.12/3.13 tests are the key unverified gate in this environment.
4. **Pin deployment supply chain:** replace mutable image tags and GitHub Action tags/`master` references with reviewed digests/SHAs.
5. **Add Playwright CI:** run the existing three smoke tests in a separate job, then expand coverage around backend-down, setup, upload, and lead status flows.
6. **Repository administration:** resolve/supersede overlapping Next.js Dependabot PRs after this patch lands and prune merged stale branches.
7. **Plan, do not rush:** split the largest Python/API and repository modules only with characterization tests; evaluate Recharts 3 and ESLint 10 as dedicated major upgrades.
