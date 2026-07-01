# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **`activate.sh`** — single-command venv entry: `./activate.sh` drops into a subshell; `exit` to leave. Canonical `source .venv/bin/activate` documented.
- **Cold-lead archival** — COLD/SKIP leads are archived to `leads/data/archive/` JSONL instead of bloating the active ChromaDB store. Archive endpoint + frontend submenu.
- **3-day rotation** — `POST /leads/rotate-cold` (explicit housekeeping) and `scripts/rotate_cold_leads.py` auto-archive COLD/WARM leads older than 3 days.
- **Tracking system** — `leads/tracking.py`: JSONL-per-lead event log for status transitions, outreach, replies. New `/tracking` and `/tracking/active` API endpoints + frontend page with won/lost summary and win rate.
- **Test isolation** — `tests/conftest.py` forces ephemeral ChromaDB directory via `LEADS_DATA_DIR` env var. Source blacklist in `upsert_lead` blocks `source="test"` in production.
- **`scripts/purge_test_leads.py`** — one-shot removal of all test-source leads from the production store.
- **Expanded scoring** — 9 new positive signals (`cxx_audio`, `dsp_any`, `real_time`, `contract_role`, `senior_role`, `audio_impl`, `audio_context`, etc.), `$5K` / `$150K` K-notation budget parsing, aggregator-page detection (directory listing pages like "234 jobs in..." get scored -50 and archived).
- **env-driven thresholds** — `HOT_THRESHOLD`, `WARM_THRESHOLD`, `MIN_RATE_CAD`, `HOURLY_FLOOR_CAD` now configurable via `.env`.

### Changed
- **`update_status`** now logs every transition as a tracking event and archives the full record when moving to `DEAD`.
- **Pipeline** no longer persists COLD/SKIP leads to ChromaDB — they go to `archive_batch` only.
- **Dashboard** now shows "Pursuing" stat (CONTACTED + REPLIED + PROPOSAL_SENT) alongside existing counts.
- **Sidebar** has new entries: Cold Leads, Tracking.

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
