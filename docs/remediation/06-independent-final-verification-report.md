# Independent final verification and release gate

Date: 2026-10-05  
Prompt: `docs/prompts/06-independent-final-verification.md`  
Candidate commit: `e10551997b0c9f40dde9e1ca246929ecd323975f`  
Verification checkout: fresh clone at `/home/user/verify-audio-freelance`, full tags/history fetched  
Decision: **NO-GO**

## Executive decision

The candidate is not releasable. Local, executable cells are substantially healthier: static Python checks and package build pass, frontend lint/unit/build and production audit pass, all outreach builds/tests and the synthetic dry-run pass, desktop npm audit passes, public versions are consistent, production auth fails closed, and repository secret/large-blob heuristics found no credential or size incident.

Those results cannot replace required release evidence. The exact candidate's GitHub Actions run failed before runner assignment with zero steps, detailed security alerts and repository controls are inaccessible, and supported Python test, browser, container/Compose, image-scan, Rust/Tauri, and Windows cells have no passing evidence. GitHub still reports 66 default-branch Dependabot alerts in aggregate, including 6 critical and 25 high, but this integration cannot review their disposition. Documentation also makes production-readiness claims contradicted by the evidence.

## Exact candidate and environment

| Item | Value |
|---|---|
| Candidate | `e10551997b0c9f40dde9e1ca246929ecd323975f` |
| PR | [#70](https://github.com/sgm-audio/Audio-Freelance/pull/70) |
| Candidate CI | [run 37420026105](https://github.com/sgm-audio/Audio-Freelance/actions/runs/37420026105) |
| OS | Linux x86_64, kernel 6.1.158 |
| Git | 2.39.5 |
| Node / npm / pnpm | 22.22.3 / 10.9.8 / 11.15.0 |
| Available Python | 3.11.2 (unsupported by project) |
| uv | 0.12.23 |
| Unavailable | Python 3.12/3.13, Docker/Compose, Cargo/Rust, Trivy/Grype, Gitleaks |

The primary gate did not modify candidate source. Installs and builds left only ignored dependency/build/cache paths; `git diff --exit-code` passed after executable checks.

## Findings

### Blockers

1. **CI did not execute.** Run 37420026105 is for the exact candidate. `build-frontend`, `lint`, `test-backend (3.12)`, `desktop`, and `test-outreach` failed in 2–4 seconds; Python 3.13 was cancelled; Playwright and Docker were skipped. Every job has an empty runner name and zero steps. This is no test evidence.
2. **Supported release matrix is incomplete.** There is no passing Python 3.12/3.13 full pytest/coverage result, real Chromium run, Docker image/Compose/profile health test, image scan, Rust fmt/Clippy/test/build result, or Windows quick-start/path result. A blocked check is not a pass.
3. **Critical/high GitHub alert disposition is incomplete.** GitHub's push response reports 66 alerts on the default branch (6 critical, 25 high, 34 moderate, 1 low). Detailed Dependabot, code-scanning, and secret-scanning APIs return HTTP 403, so the critical/high set cannot be reconciled with local audits.
4. **Repository release controls are unverified.** Branch protection, required checks, Actions permissions/runners, and security-feature APIs return HTTP 403. A protected production environment is not configured. Required review, stale-approval, force-push/deletion, secret-scope, and check-name policy therefore remain unknown.

### High

1. **Pre-merge container validation is absent.** `.github/workflows/ci.yml:178-181` runs the Docker job only on `master` or tag pushes, not PRs. It builds images but does not validate Compose profiles, health/persistence, or scan images. Even with working runners, PR #70 cannot establish the required container release gate.
2. **Deployment identity remains mutable by default.** Compose defaults use readable image tags rather than verified manifest digests. Digest overrides and rollback instructions are documented, but the default candidate deployment was not digest-verified or exercised.
3. **Production-readiness documentation is overstated.** `README.md:284-287` marks images, Compose, CI, and backend tests production-grade despite missing authoritative execution. This can induce an unsafe release decision.

### Medium

1. **README capability status is stale.** `README.md:295` says no frontend unit runner exists, although four Node unit tests run. `README.md:296` says Playwright is not in CI, while `.github/workflows/ci.yml:128-156` defines it. The API table at `README.md:300-318` lists only a subset of current OpenAPI routes, omitting cold-lead, tracking, profile, company, bulk/manual upload, and related routes.
2. **Desktop lock regeneration is tool-version-sensitive.** With documented Node 22 and bundled npm 10.9.8, `npm install --package-lock-only --ignore-scripts` removes `libc` metadata from five optional Tauri CLI packages. The manifest does not pin a package manager. `npm ci` itself succeeds and audit is clean, but lock regeneration is not reproducible with the stated environment.
3. **Tracked files contradict their ignore policy.** Four `desktop/src-tauri/gen/schemas/*.json` files are tracked while `desktop/src-tauri/.gitignore:5-7` describes and ignores that generated schema tree. This is hygiene drift, not a runtime failure.
4. **Auth failures are not visibly security-audited.** The dependency correctly rejects absent/invalid tokens, but the reviewed auth path does not itself record a redacted denial event. Rate-limit and request middleware logging exists; explicit auth-denial observability should be decided and tested.

### Low

1. The full-history credential check was a conservative pattern scan because a dedicated scanner was unavailable. It found no private-key markers or recognizable GitHub/AWS/OpenAI token shapes in 149 reachable commits, but cannot provide the confidence of Gitleaks plus GitHub secret scanning.

## Gate-by-gate results

| Gate | Command/evidence | Result |
|---|---|---|
| Integrity | Fresh clone; `git fsck --full --no-dangling`; clean status | Pass |
| Full history | 149 commits; private-key and recognizable provider-token pattern scans | Pass with tool limitation |
| Large blobs | `git rev-list --objects --all` + `git cat-file`; threshold 5 MiB | Pass; largest blob is `uv.lock` at about 1.1 MiB |
| Artifact hygiene | tracked-path scan; ignored/tracked scan | Medium finding: tracked ignored Tauri schemas; no `.env`, DB, logs, caches, dependency trees, browser reports, or customer data found |
| Markdown links | local relative-link verifier across all Markdown | Pass: zero broken relative links |
| Metadata | `.gitignore`, `.gitattributes`, CODEOWNERS, MIT license, package metadata | Pass except generated-schema inconsistency |
| Version | `python scripts/check_version.py` | Pass: 0.1.2 |
| Frontend lock/install | `npm ci`; package-only regeneration; tracked diff check | Pass |
| Outreach lock/install | `pnpm install --frozen-lockfile`; tracked diff check | Pass |
| Desktop lock/install | `npm ci`; package-only regeneration | Install pass; regeneration fail as described above |
| Python lock | `uv export --frozen`; `uv lock --check` | Export pass; lock check blocked because Python >=3.12 is unavailable |
| Cargo lock | locked Cargo checks | Blocked: Cargo unavailable |
| Python static | Ruff check/format; mypy; compileall | Pass: 112 formatted files, zero Ruff/mypy findings |
| Python package | build wheel/sdist; Twine check | Pass at 0.1.2 |
| Python runtime | Python 3.12/3.13 frozen sync, full pytest, coverage | Blocked; available Python is unsupported 3.11 |
| Frontend | Node 22 `npm ci`, lint, four unit tests, Next production build | Pass |
| Browser | `npm run test:e2e:install`; Playwright execution | Blocked: Debian package endpoints failed; browser not installed |
| Outreach | frozen install; strict builds; all Vitest tests | Pass: 72/72 |
| Outreach safety | isolated synthetic `outreach:dry-run` | Pass: 9 mock sends, 1 suppressed, pause gate OK; no live send |
| Desktop JS | `npm ci --ignore-scripts`; npm audit | Pass: zero npm findings |
| Rust/Tauri | fmt, Clippy `-D warnings`, test, locked build | Blocked: Rust/Cargo unavailable and CI did not run |
| Containers | both app image builds, Compose profiles/overrides, health/persistence | Blocked: Docker unavailable and CI Docker job skipped |
| Image scans | Trivy/Grype | Blocked: tools/images unavailable |
| Chroma exposure | source/deployment grep and regression-test inspection | Pass: no deployed Chroma HTTP service, `CHROMA_HOST`, `HttpClient`, or port 8001 |
| Briefing auth | route dependency inspection plus auth dependency policy exercise | Partial pass: `/briefing` uses `Depends(require_api_key)`; production rejects empty key; missing/wrong keys return 401; hosted runtime blocked |
| Approval auth | approval package's seven tests in complete Vitest run | Pass: HMAC, timestamp expiry, replay rejection, malformed/unsigned rejection |
| Upload abuse | POSIX/Windows traversal, oversize stream, type, interruption, filename suite | Blocked independently with Python runtime; tests exist but CI did not execute |
| Headers/CORS/rate/body/logging | source review and prior regression tests | Partial; runtime security suite blocked and auth-denial logging finding remains |
| Non-root | Dockerfile inspection | Pass statically: backend `appuser`, frontend/outreach `node`; runtime confirmation blocked |
| Launcher | `python run.py --check` | Expected fail: correctly reports missing `uv`; no supported runtime start/stop smoke |
| README quick starts | POSIX/Windows procedures | Blocked by tools; Windows unavailable |
| Actions integrity | workflow parse/review | Pass statically: global `contents: read`, scoped package write, actions pinned to full SHAs |
| Actual CI | exact candidate run 37420026105 | Fail/blocker: no runner and zero steps |
| Repository controls | GitHub APIs | Blocked: HTTP 403 |

## Security advisory disposition

| Ecosystem | Independent result | Disposition |
|---|---|---|
| Python | `pip-audit` on frozen export: five reported findings in ChromaDB 1.5.9 across PYSEC-2026-311 and PYSEC-2026-3813/3814/3815; no fix versions | Accepted only for embedded use; issue #71, maintainer, review 2026-11-05. Network Chroma remains prohibited. Release still blocked by unreconciled GitHub alert set. |
| Frontend production | `npm audit --omit=dev`: zero | Pass |
| Frontend development | full install reports nine high findings through build tooling; deprecation warnings for Recharts 2 and ESLint 9 | Deferred majors per maintainer decision; build-time risk only. Do not force fixes. |
| Outreach | pnpm audit: two critical Tinypool records and two moderate Vitest/@vitest/mocker records | Accepted development/test-runner risk under issue #72, maintainer, review 2026-11-05. Do not run untrusted tests on privileged runners. |
| Desktop npm | zero | Pass |
| Rust | not audited | Blocked |
| Images | not scanned | Blocked |
| GitHub default branch | aggregate 6 critical, 25 high, 34 moderate, 1 low | **Unresolved blocker** because details and dispositions are inaccessible |

## Failure reproductions

### CI runner failure

```bash
gh api repos/sgm-audio/Audio-Freelance/actions/runs/37420026105/jobs \
  --jq '.jobs[] | [.name,.conclusion,(.runner_name//""),(.steps|length)] | @tsv'
```

Runnable jobs report blank runner names and zero steps. Resolve issue #73, then rerun the exact candidate.

### Unsupported Python

```bash
UV_NO_MANAGED_PYTHON=1 uv lock --check
# error: No interpreter found for Python >=3.12 in search path
```

### Browser installation

```bash
cd frontend
npm run test:e2e:install
# Debian endpoints fail; Playwright exits 1 before installing Chromium.
```

### Desktop lock drift

```bash
cd desktop
npm ci --ignore-scripts
npm install --package-lock-only --ignore-scripts
npm --version  # 10.9.8
node --version # v22.22.3
git diff --exit-code -- package-lock.json
```

The final command fails because npm removes five optional-package `libc` arrays.

### Administrator APIs

```bash
gh api repos/sgm-audio/Audio-Freelance/branches/master/protection
gh api repos/sgm-audio/Audio-Freelance/actions/permissions
gh api repos/sgm-audio/Audio-Freelance/actions/runners
# HTTP 403: Resource not accessible by integration
```

## Documentation drift

- `README.md:284-287`: unverified images, Compose, CI, and tests are marked production-grade.
- `README.md:295`: frontend unit-test status is stale.
- `README.md:296`: Playwright CI status is stale.
- `README.md:300-318`: API table is incomplete relative to router/OpenAPI coverage.
- Release/version and digest rollback instructions are current and plausible.
- `.env.example` documents consumed settings, including optional path/test controls as commented safe placeholders; no real credentials are present.

## Accepted risks

| Risk | Owner | Expiry/review | Conditions |
|---|---|---|---|
| ChromaDB no-fix advisories | maintainer / issue #71 | 2026-11-05 | Embedded `PersistentClient` only; no HTTP server/port |
| Vitest/Tinypool development advisories and Vitest 4 deferral | maintainer / issue #72 | 2026-11-05 | No untrusted tests on privileged runners |
| External-provider/Ollama test skips | maintainer / issue #74 | 2026-11-05 | Explicit skips only; not counted as passed integration coverage |
| Frontend build-time advisories and deferred Recharts/ESLint majors | maintainer / research PRs | Reassess with upstream fixes | Production audit must remain zero; no forced major changes |

There is **no accepted risk** covering the aggregate critical/high GitHub alerts, missing supported-platform gates, failed CI infrastructure, or unknown repository controls.

## Minimum ordered remediation and reruns

1. Repository administrator resolves Actions runner/billing/policy issue #73. Rerun CI for the exact candidate and require jobs to show a real runner, checkout, and completed steps.
2. With sufficient Security access, export and disposition every critical/high Dependabot alert; review code/secret scanning; rotate and history-clean any real secret rather than merely deleting the current file.
3. Run clean Python 3.12 and 3.13 frozen installs, import smoke, full pytest/coverage, upload abuse/auth/header/body-limit regressions, package build, and capture artifacts. Establish the coverage threshold from the first trustworthy baseline.
4. Execute Playwright in real Chromium and retain failure artifacts.
5. On Docker-capable infrastructure, validate every Compose profile/override, both application images, non-root runtime, health, persistence, restart behavior, and Trivy/Grype scans. Make container validation a pre-merge gate or provide equivalent candidate-digest evidence.
6. On the pinned Rust toolchain, regenerate/check Cargo metadata, run fmt, Clippy with warnings denied, tests, and locked Tauri build on supported platforms.
7. Pin/document the npm version used to generate the desktop lock and regenerate it reproducibly; decide whether ignored Tauri schemas should be committed or removed from tracking.
8. Correct README production/capability/API claims, then execute documented quick starts on POSIX and Windows-supported paths.
9. Configure and verify branch protection, required checks, protected production environment, approvals, secret scope, and force-push/deletion policy. Required check names must match successful real jobs.
10. Rerun the entire affected matrix from a fresh checkout at one immutable commit. Release only if all supported cells pass and no unaccepted blocker or critical/high finding remains.

## Final recommendation

**NO-GO.** PR #70 must remain `in progress`. The remediation provides meaningful local improvements, but release criteria are not met until authoritative supported-platform, browser, container, desktop, security-alert, CI-runner, and repository-control evidence exists and the inaccurate production-readiness documentation is corrected.
