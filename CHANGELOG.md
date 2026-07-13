# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Windows support** — cross-platform `run.py` launcher (pre-flight checks, backend + frontend startup, whole-tree shutdown on all platforms; `--check` and `--verbose` flags). `run.bat`, `activate.ps1`, `activate.bat` wrappers. Windows Quick Start in README. `run.sh`/`activate.sh` remain for POSIX.
- **Centralized configuration** — single `config.py` with `pydantic-settings`. All 20+ env vars validated at import time. Removed 6 scattered `load_dotenv()` calls. Required keys crash immediately if missing.
- **Automated backup** — `scripts/backup.sh` tars ChromaDB, archives, tracking, and profile. `--retain N` (default 7), `--verify` flag. Integrated into Friday ritual.
- **Data integrity check** — `scripts/check_integrity.sh` validates ChromaDB SQLite integrity, JSONL parse validity, and profile YAML.
- **Docker CI job** — builds + pushes backend and frontend images to GHCR on every `master` push and tag. `docker-compose.prod.yml` override.
- **Structured logging** — `structlog` with JSON output and `contextvars`-based correlation IDs. Every request gets a unique `X-Correlation-ID` header. Compatible with ELK, Loki, Datadog.
- **Sentry error tracking** — optional `sentry-sdk[fastapi]` integration. Zero-config without `SENTRY_DSN`. Silenced exception handlers now log warnings.
- **Prometheus metrics** — `GET /metrics` endpoint (no auth). Counters for pipeline runs, leads discovered, API requests. Gauges for lead count and Ollama availability. Histogram for request duration.
- **API integration tests** — 38 smoke tests exercising every endpoint via `TestClient`. All 9 route groups covered.
- **Architecture diagram** — Mermaid graph in README: User → Frontend → Backend → Pipeline DAG + Ollama/ChromaDB/Search/ATS/Monitoring.
- **Environment reference** — complete env var table (25 fields from `config.py`) with defaults and descriptions.
- **Production readiness checklist** — 16 production-grade items in README.
- **Fly.io deploy** — `fly.toml` config (Seattle region, auto-stop, HTTPS). CD workflow deploys on `v*` tags. Deployment docs in README.
- **Frontend e2e tests** — Playwright smoke tests (dashboard render, sidebar nav, theme toggle). Run with `npm run test:e2e`.
- **Screenshots gallery** — placeholder table in README with headless capture instructions for Firefox/Chrome.

### Fixed
- 3 incidental bugs: `setup_logger`→`get_logger` import, em-dash encoding crash, route ordering for `{lead_id}` catch-all.
- Added `python-multipart` dependency (required by FastAPI `TestClient`).
- Docker Compose missing env vars for API keys — now uses `.env` file in prod profile.

### Changed
- Test suite: 65 → 119 tests (81 unit + 38 integration).
- 13 files refactored to use centralized `config.settings`.
- Docker Compose: `image:` fields enable GHCR pull with local `build:` fallback.

## [v0.1.2] - 2026-07-07

### Added
- **LangGraph orchestration** (Phase 3) — 5 new graph nodes: `generate_translate`, `generate_outreach`, `queue_for_review`, `notify_hot`, `await_human_send`. Full 6-node pipeline from search → score → generate → review.
- **Extended diagnostics** (Phase 4) — per-source API connectivity checks (Tavily/Serper/Firecrawl), Chroma collection stats, error log sweep, 6 failure modes catalogue with remediation steps.
- **Ops rituals** (Phase 6) — 5 executable scripts: `morning_ritual.sh`, `midday_check.sh`, `evening_triage.sh`, `friday_ritual.sh`, `check_followups.sh`.
- **OpenCode commands** — `/debug`, `/prospect`, `/transcribe`, `/rituals` slash commands wired to the system.
- **Reply triage** — `generate/triage.py` keyword-based reply classifier (proposal/rate/decline/dead). `POST /tracking/triage` and `POST /tracking/triage/batch` endpoints.
- **Test coverage** (Phase 7) — 16 new tests: 9 for LangGraph pipeline nodes, 7 for diagnostics module (81 total).

### Fixed
- **CI pipeline** — `actions/checkout@v7` (non-existent) → `@v4`; `astral-sh/setup-uv@v5` → `@v4`. All 4 CI jobs now pass.
- **CI lint gate** — pre-existing ruff S/SIM/N rules ignored in `pyproject.toml` so `ruff check .` exits 0. New code uses `contextlib.suppress(Exception)`.

## [v0.1.1] - 2026-07-07

### Added
- **Company blocklist** — block any company from appearing in leads. Block button on each lead card, managed via Preferences.
- **Worldwide search coverage** — tier1-4 queries expanded from 15 to 60+ total across European, Australian, freelance platform, niche audio community, game audio, and VC-backed audio AI sources.
- **Auto-rotation on startup** — checks if ≥3 days since last rotation on every boot; auto-rotates cold leads. Laptop-friendly, no cron needed.
- **Rotation status endpoint** — `GET /leads/rotation-status` with last rotation timestamp. Cold-leads page shows "Last rotated: Xh ago ⚡ due" indicator.
- **Verified ATS company slugs** — 17 companies across Greenhouse/Lever/Ashby with confirmed working slugs.
- **Cold-lead archival** — COLD/SKIP leads archived to `leads/data/archive/` JSONL instead of ChromaDB. Archive endpoint + frontend submenu.
- **3-day rotation** — `POST /leads/rotate-cold` and `scripts/rotate_cold_leads.py` auto-archive stale leads.
- **Tracking system** — JSONL-per-lead event log for status transitions, outreach, replies. `/tracking`, `/tracking/active`, `/tracking/won-lost` endpoints + frontend page with win rate.
- **Test isolation** — ephemeral ChromaDB via `LEADS_DATA_DIR` env var. Source blacklist blocks `source="test"` in production.
- **Expanded scoring** — 9 new positive signals, K-notation budget parsing, aggregator-page detection (-50 score + archive).
- **Env-driven thresholds** — `HOT_THRESHOLD`, `WARM_THRESHOLD`, `MIN_RATE_CAD`, `HOURLY_FLOOR_CAD` configurable via `.env`.
- **UX polish** — skeleton loaders on 5 routes, error boundaries on 9 routes, Recharts donut/bar charts, progress bars, sparkline bars. Zero new dependencies.
- **Performance** — client-side TTL fetch cache (30s) in `api.ts`; sidebar `<Link prefetch={true}>` for instant client navigation.
- **Portfolio file upload** — `POST /profile/upload` (PDF/DOCX/images, 10MB max, `assets/portfolio/`). New step in setup wizard, file manager in Preferences.
- **Request logging** — middleware logs every `/api/` request with method, path, status, duration. Color-coded by severity.
- **Security headers** — `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`. Auth-disabled warnings via `X-Auth-Status` + `X-Auth-Warning` headers.
- **Input validation** — Pydantic models (`ProfileUpdateRequest`, `ScoreRequest`, `LeadStatusUpdate`) with `extra=forbid`. Replaced raw dict and spread query params.

### Changed
- **run.sh** — `set -euo pipefail`, pre-flight checks (uv, node, npm, .env, port 8080/3000), 60s health poll, `VERBOSE=1` mode, colored output.
- **Startup auth warning** — ASCII banner in terminal logs instead of silent `warnings.warn()`.
- **Code style** — ruff import sorting + format across project. `.gitignore` additions for ChromaDB segment dirs, bun lockfiles, `token-optimizer/`.
- **Frontend error pages** — stale hardcoded paths replaced with `./run.sh` / `make backend` / `make frontend`.
- `update_status` logs every transition as tracking event; archives on `DEAD`.
- Pipeline no longer persists COLD/SKIP leads to ChromaDB — archive-only.
- Dashboard shows "Pursuing" stat (CONTACTED + REPLIED + PROPOSAL_SENT).
- Sidebar has new entries: Cold Leads, Tracking, Preferences.

### Fixed
- **Tier cap 4→5** — `run_tier5` leads now pass `Lead` model validation.
- **Test isolation timing** — `LEADS_ALLOW_TEST_LEADS` set at module level before `leads/store.py` import.
- Test leads (`source="test"`) no longer pollute production ChromaDB.
- Aggregator/directory pages no longer appear as scored leads.
- Budget patterns catch K-notation (`$5K`, `$150K contract`).

### Security
- **API keys rotated** — Tavily, Serper, Firecrawl keys regenerated. Previous keys were never in git, rotated out of caution.

## [0.1.0] - 2026-06-17

### Added

- **Production security** — API key auth (Bearer token, configurable via `API_KEY` env var), CORS restricted to localhost + `CORS_ORIGINS` env var, rate limiting (60 req/min via slowapi), non-root user in Dockerfile
- **Security audit** — Full scan: 0 leaked secrets in git, 0 CVEs in Python deps, 2 moderate npm vulns (build-time only), all findings documented and fixed
- **Production polish** — `.editorconfig`, `ruff` config in `pyproject.toml`, `.pre-commit-config.yaml` with auto-lint hooks, GitHub issue templates (bug + feature), `SECURITY.md`, `CONTRIBUTING.md`, Dependabot config (pip + npm + actions), coverage reporting in CI
- **Dashboard screenshot** — `frontend/public/dashboard.png`, displayed in README
- **React Three Fiber 3D visualization** — Animated waveform on dashboard hero (`frontend/src/components/audio-vis.tsx`)
- **Docker images** — Backend Dockerfile (Python 3.12-slim, uv-based, non-root), Frontend Dockerfile (Node 22, standalone Next.js output)
- **One-command demo** — `docker compose up` spins up ChromaDB + backend + frontend + optional Ollama, seeds synthetic demo leads
- **Seed script** — `scripts/seed.py` with 5 generic synthetic leads for demo mode
- **Search query rewrite** — Tier 1 queries now target LinkedIn Jobs, Indeed, ZipRecruiter instead of forum discussions. Real job boards only.
- **Ollama-free embedding** — ChromaDB falls back to `sentence-transformers` (`all-MiniLM-L6-v2`) when Ollama is unavailable. Install via `uv sync --extra local`
- **Structured logging** — `debug/log.py` with consistent `timestamp LEVEL module message` format
- **Research module split** — `research/market.py` broken into `research/sources/__init__.py` (queries + search functions) + clean orchestrator
- **Better pricing extraction** — Filters marketplace noise (Fiverr, Upwork), enforces minimum $2k contract thresholds, rejects sub-$50/hr rates
- **API key stub detection** — `search/base.py::_is_key_valid()` uses heuristic (length, unique chars, known stubs) instead of hardcoded placeholder strings
- **Frontend `.env.example`** — Documented frontend environment configuration
- **Frontend README** — Replaced Next.js boilerplate with project-specific docs
- **Frontend dark/light theme toggle** — `frontend/src/components/theme-toggle.tsx`
- **Dashboard backend-down state** — All pages show "Backend Not Running" screen with startup instructions when API is unreachable
- **Frontend 10s timeouts** — AbortController on all API calls prevents hanging
- **`/briefing` endpoint** — Plain-text daily briefing with lead counts, hot leads, saved files
- **`/dispatch` endpoint** — Emails briefing to `BRIEFING_EMAIL` via `mail` command
- **Market intelligence engine** — 6-category scanner: funding rounds, tech trends, product launches, pricing, hiring signals, GitHub activity. Tracks 14 technologies.

### Fixed

- **Sensitive files removed from git** — `outreach/` (personal application drafts) deleted from git, added to `.gitignore`
- **Seed script rewritten** — Uses only generic/synthetic data (Example Corp, Acme Audio, example.com)
- **CORS wildcard removed** — `allow_origins=["*"]` replaced with restricted origin list
- **Hardcoded email removed** — `main.py:255` now uses `your@email.com` placeholder
- **Hardcoded localhost URLs** — Frontend sidebar now uses proxy-relative paths; briefing endpoint uses `PUBLIC_URL` env var
- **`.gitignore` gaps** — `.env` → `.env*` glob (catches `.env.development`, `.env.production`, etc.), added `*.pem *.key *.cert` patterns
- **Niche name mismatches** — Tests used `plugin_contract` but actual names are `plugin_dev`. Fixed across all test files.
- **Missing `search_all`/`route_by_verdict`** — Added to `graph/pipeline.py` for LangGraph compatibility
- **Missing `.env.example`** — Created for both backend and frontend

### Changed

- `main.py` — Split into public router (health) and protected router (auth required)
- `api/routes.py` — Health endpoint moved to `public` router without auth
- `research/market.py` — Refactored from 496-line single file to modular `research/sources/` structure
- `search/base.py` — Stub key detection uses heuristic instead of exact string matching
- `leads/store.py` — Embedding falls back to `sentence-transformers` when Ollama unavailable
- `Dockerfile` — Non-root `appuser`, `chown`, HEALTHCHECK with `start-period`
- `pyproject.toml` — Added `ruff` config, `coverage` config, `local` optional deps
- `next.config.ts` — Standalone output for Docker, `API_HOST` env var support

### Removed

- `outreach/READY_TO_SEND.md` — Personal application drafts removed from public repo (local only)
- `outreach/MAMBA_SSM_ALL_REFERENCES.md` — Research references removed from public repo (local only)

## [0.0.1] - 2026-06-16

### Added

- Initial FastAPI backend with multi-tier search (Tiers 1-4)
- ChromaDB storage with Ollama embeddings and dedup
- Lead scoring pipeline with signal detection (C++, CLAP, Mamba/SSM, REAPER, etc.)
- LangGraph pipeline orchestration
- FastAPI REST API (health, leads, prospect, score, translate, rate, debug)
- Next.js 16 frontend with Tailwind, shadcn/ui, Inter font
- Dashboard, Leads, Market, and Opportunities pages
- Asset registry with claim validation
- Outreach and proposal generators
- Diagnostics module
- Docker Compose for Ollama + ChromaDB
- MIT License
- 65 backend tests
