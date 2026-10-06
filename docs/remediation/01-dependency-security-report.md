# Dependency security remediation report

Date: 2026-10-05
Prompt: `docs/prompts/01-dependency-security.md`
Status: **remediated with explicit deferred/blocked risks; NO-GO until final gates are resolved**

## Audit and remediation summary

| Ecosystem | Baseline | Remediation | Current result |
|---|---|---|---|
| Python (`uv.lock`) | 16 findings across 7 packages in a frozen `uv export`: aiohttp, chromadb, langgraph-sdk, langsmith, multidict, oauthlib, pydantic-settings. | Regenerated with uv; updated aiohttp 3.14.1→3.14.4, langgraph-sdk 0.4.2→0.4.5, langsmith 0.8.16→0.8.18, multidict 6.7.1→6.9.1, OAuthlib 3.3.1→4.0.0, pydantic-settings 2.14.1→2.15.0, and yarl 1.24.2→1.25.1. | 5 scanner records, all against chromadb 1.5.9 and all without a fixed release. |
| Frontend npm | 10 high total; 1 high production (`source-map-js`). | Lock-only audit fix and existing patch/minor manifest updates; no forced/breaking audit fix. | `npm audit --omit=dev`: 0. Full audit: 9 high, all dev/build paths through shadcn/eslint tooling. |
| Outreach pnpm | 2 critical, 2 high, 3 moderate, all test/build tooling. | pnpm overrides patched postcss to 8.5.23, nanoid to 3.3.18, and source-map-js to 1.2.2. | 2 critical and 2 moderate remain through Vitest 3.2.7/tinypool/@vitest-mocker. No runtime high/critical finding. |
| Rust/Tauri | Not established. | None. | Blocked: Cargo is not installed in this execution environment. |
| Container image | Not established. | None. | Blocked: Docker, Trivy, and Grype are unavailable. |
| GitHub Dependabot | Aggregate only: 66 alerts (6 critical, 25 high, 34 moderate, 1 low). | Local lockfile remediation performed. | Detailed alert-to-package disposition is blocked by HTTP 403 from GitHub security APIs. |

## Python advisory disposition

| Package | Current | Advisory/finding | Scope and disposition |
|---|---:|---|---|
| aiohttp | 3.14.4 | PYSEC-2026-3545/3546/3547 | Fixed. |
| langgraph-sdk | 0.4.5 | CVE-2026-104873 | Fixed. |
| langsmith | 0.8.18 | CVE-2026-59152 | Fixed with the smallest reported fixed version. |
| multidict | 6.9.1 | CVE-2026-104874 | Fixed. |
| oauthlib | 4.0.0 | PYSEC-2026-4114 | Fixed through the only maintainer-approved major upgrade. |
| pydantic-settings | 2.15.0 | CVE-2026-58203 | Fixed. |
| chromadb | 1.5.9 | PYSEC-2026-311, PYSEC-2026-3813, PYSEC-2026-3814, PYSEC-2026-3815 | No fixed version reported. The application uses embedded `PersistentClient`; no checked-in Chroma HTTP service is deployed or published. Regression test: `tests/test_chroma_deployment_security.py`. Owner: maintainer. Recheck 2026-11-05 in issue #71. |

`pip-audit` emitted duplicate records for some Chroma/Python advisories, producing five records for four distinct listed IDs.

## Deferred JavaScript risk

Vitest 3.2.7 is a direct dev dependency of private outreach packages. Its dependency graph retains:

- two critical tinypool prototype-pollution/RCE advisories, fixed by tinypool 2.1.1/2.1.2 but not resolvable under Vitest 3;
- moderate traversal/arbitrary-file-read reports in Vitest and `@vitest/mocker`, fixed by Vitest 4.1.11.

The maintainer explicitly deferred Vitest 4. The packages are not production runtime dependencies, but tests must not execute untrusted input on privileged runners. Issue #72 owns the upgrade review, due 2026-11-05. Dependabot PR #65 remains labeled `research` and `in progress`.

The frontend's nine high findings are likewise dev/build-only. Recharts 3 and ESLint 10 remain deferred majors. Production audit is clean.

## Chroma non-exposure evidence

- Application sources instantiate `chromadb.PersistentClient` and do not instantiate `chromadb.HttpClient`.
- Checked-in Compose files do not declare the Chroma image or a Chroma server HTTP port.
- `tests/test_chroma_deployment_security.py` enforces both controls.
- Upstream monitoring and a dated review are tracked in issue #71.

## Lock generation note

The repository requires Python 3.12+, but this runner has only Python 3.11 and downloads of managed 3.12/3.13 runtimes repeatedly failed through the release-assets transport. To avoid hand-editing package hashes, uv generated the complete lock using a temporary local copy of the manifest with a 3.11 interpreter floor. The manifest was restored, and only the generated lock's top-level `requires-python` metadata was restored to the repository's unchanged `>=3.12` declaration. `uv export --frozen` then succeeded. A clean Python 3.12 lock-drift check remains required in independent verification.

## Verification evidence

Passed locally:

- `npm ci`
- `npm run lint`
- `npm run build`
- `npm audit --omit=dev` — 0 findings
- `pnpm install` (native addon built using installed Node headers)
- `pnpm test` — all 10 package suites, 72 tests passed
- `pnpm audit` — reduced from 7 to 4 dev-only records
- frozen `uv export` followed by `pip-audit --no-deps --disable-pip`
- `git diff --check`

Blocked or deferred:

- Python 3.12/3.13 frozen sync, complete Python tests, import smoke, and clean lock regeneration: compatible runtime unavailable here.
- Cargo audit/check: Cargo unavailable.
- Container build and image scan: Docker/Trivy/Grype unavailable.
- GitHub alert-by-alert disposition: security API HTTP 403.
- GitHub Actions: jobs terminate before runner assignment.

## Recommendation

**NO-GO at this intermediate gate.** Runtime findings with available fixes were addressed and frontend production audit is clean, but release approval requires independent Python 3.12+ lock/test verification, Rust and image checks, GitHub alert detail access, and an explicit final disposition of the deferred critical Vitest toolchain risk.
