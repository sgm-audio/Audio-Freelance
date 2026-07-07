# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Session 2026-07-07

### Changed
- **Code style** — applied ruff import sorting (`ruff check --fix`) and black formatting across 24 source files. No logic changes.
- **.gitignore** — added patterns for stray ChromaDB segment directories, bun lockfiles, and `token-optimizer/` tool data.

### Fixed
- **Tier cap 4→5** — `run_tier5` was producing tier=5 leads rejected by `Lead` model (validator + `RawCandidate.__post_init__` both hardcoded to 4).
- **Test isolation timing** — `conftest.py` used `monkeypatch.setenv` but `leads/store.py` reads `LEADS_ALLOW_TEST_LEADS` at module import time (before fixtures run). Fixed by setting `os.environ` directly at module level.

## Session 2026-07-07 (afternoon)

### Added
- **UX polish** — skeleton loaders (`loading.tsx`) on all 5 routes; error boundaries (`error.tsx`) on all 9 routes with retry/dashboard fallback; Recharts donut chart (lead status distribution) on dashboard; horizontal bar chart (pricing by niche) on market; progress bars in StatCards; sparkline bars in trends table. All zero-dependency additions — Recharts already installed.
- **Performance** — client-side TTL fetch cache (30s) in `api.ts` eliminates redundant API calls when switching tabs; sidebar converted from `<a>` to `<Link prefetch={true}>` for instant client-side navigation. `clearFetchCache()` exported for mutation invalidation.
- **Portfolio file upload** — `POST /profile/upload` endpoint (PDF/DOCX/images, 10MB max, stored in `assets/portfolio/`). New "Portfolio" step in the 6-step setup wizard. File management section in Preferences.
- **Request logging** — middleware logs every `/api/` request: `METHOD path → status (duration)`. Color-coded by severity.
- **Security headers** — `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` on all responses. `X-Auth-Status: disabled` + `X-Auth-Warning` headers when `API_KEY` unset.
- **Input validation** — Pydantic models (`ProfileUpdateRequest`, `ScoreRequest`, `LeadStatusUpdate`) with `extra=forbid` on profile updates. Replaced raw `dict` and spread query params with typed body models.

### Changed
- **run.sh** — `set -euo pipefail`, pre-flight checks (uv, node, npm, .env, port conflicts 8080/3000), 60s health poll, `VERBOSE=1` mode, colored output.
- **Startup auth warning** — replaced silent `warnings.warn()` with ASCII banner visible in terminal logs.
- **Code style** — `ruff format` applied to 19 files (auto-formatted whitespace/quotes).
- **Frontend error pages** — stale hardcoded paths replaced with `./run.sh` / `make backend` / `make frontend`.

### Security
- **API keys rotated** — Tavily, Serper, Firecrawl keys regenerated. Previous keys were never in git (`.env*` gitignored), but rotated out of caution. Rotation date recorded in `.env` header.

---

## [Unreleased]

### Added
- **Company blocklist** — block any company from appearing in leads. Block button on each lead card, managed via Preferences. Past employers, competitors, or companies with irrelevant recurring postings can be suppressed individually.
- **Worldwide search coverage** — tier1-4 queries expanded from 15 to 60+ total. Now includes: European job boards (indeed.co.uk, indeed.de, indeed.fr, reed.co.uk), Australian board (seek.com.au), freelance platforms (upwork, freelancer, peopleperhour, guru), niche audio communities (KVR, VI-C, Reddit r/audioengineering, r/DSP, r/rust, r/MachineLearning, r/GameAudio, r/gamedev), game audio (gamesjobsdirect, itch.io), Asian audio companies, and VC-backed audio AI startups.
- **Auto-rotation on startup** — no cron needed. Every time the app starts, it checks if ≥3 days since last rotation and auto-rotates cold leads. Laptop-friendly: works even with intermittent uptime.
- **Rotation status endpoint** — `GET /leads/rotation-status` shows last rotation timestamp and hours since. Cold-leads page shows "Last rotated: Xh ago ⚡ due" indicator.
- **Verified ATS company slugs** — 17 companies across Greenhouse/Lever/Ashby. Spotify (121 jobs, 76 audio-relevant), Splice, Universal Audio, David AI confirmed working. 13 more pre-loaded with correct slugs.
- **`activate.sh`** — single-command venv entry: `./activate.sh` drops into a subshell; `exit` to leave. Canonical `source .venv/bin/activate` documented.
- **Cold-lead archival** — COLD/SKIP leads are archived to `leads/data/archive/` JSONL instead of bloating the active ChromaDB store. Archive endpoint + frontend submenu.
- **3-day rotation** — `POST /leads/rotate-cold` (explicit housekeeping) and `scripts/rotate_cold_leads.py` auto-archive COLD/WARM leads older than 3 days.
- **Tracking system** — `leads/tracking.py`: JSONL-per-lead event log for status transitions, outreach, replies. New `/tracking` and `/tracking/active` API endpoints + frontend page with won/lost summary and win rate.
- **Test isolation** — `tests/conftest.py` forces ephemeral ChromaDB directory via `LEADS_DATA_DIR` env var. Source blacklist in `upsert_lead` blocks `source="test"` in production.
- **`scripts/purge_test_leads.py`** — one-shot removal of all test-source leads from the production store.
- **Expanded scoring** — 9 new positive signals (`cxx_audio`, `dsp_any`, `real_time`, `contract_role`, `senior_role`, `audio_impl`, `audio_context`, etc.), `$5K` / `$150K` K-notation budget parsing, aggregator-page detection (directory listing pages like "234 jobs in..." get scored -50 and archived).
- **env-driven thresholds** — `HOT_THRESHOLD`, `WARM_THRESHOLD`, `MIN_RATE_CAD`, `HOURLY_FLOOR_CAD` now configurable via `.env`.

### Changed
- **Code style** — applied ruff import sorting (`ruff check --fix`) and black formatting across 27 source files. No logic changes.
- `POST /leads/rotate-cold` now records rotation timestamp for status tracking.
- Companies list updated with verified Greenhouse/Lever/Ashby slugs.
- **`update_status`** now logs every transition as a tracking event and archives the full record when moving to `DEAD`.
- **Pipeline** no longer persists COLD/SKIP leads to ChromaDB — they go to `archive_batch` only.
- **Dashboard** now shows "Pursuing" stat (CONTACTED + REPLIED + PROPOSAL_SENT) alongside existing counts.
- **Sidebar** has new entries: Cold Leads, Tracking, Preferences.

### Fixed
- Test leads (`source="test"`) no longer pollute the production ChromaDB on `pytest` runs.
- Aggregator/directory pages no longer appear as scored leads.
- Budget patterns now catch K-notation (`$5K`, `$150K contract`) in addition to numeric.

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
