# AGENTS.md

## Cursor Cloud specific instructions

This repo is a hybrid monorepo with three components. The update script already installs all
dependencies (`uv sync`, `npm --prefix frontend install`, `pnpm install`), so you normally only
need to start/build/test services.

### Components & how to run them

| Component | Location | Run (dev) | Port | Test | Lint |
|---|---|---|---|---|---|
| FastAPI backend ("Audio-Freelance") | repo root (`main.py`, `api/`, `leads/`, ...) | `uv run python main.py` (`make backend`) | 8080 | `make test` | `uvx ruff@0.11.0 check .` |
| Next.js 16 dashboard | `frontend/` | `cd frontend && npm run dev` (`make frontend`) | 3000 | Playwright e2e in `frontend/e2e` | see caveat below |
| SGM Outreach Engine (TS pnpm monorepo) | `packages/*` | build then `pnpm sgm-outreach <cmd>` | n/a (CLI) | `pnpm test` | tsc |

Run both core services together with `python3 run.py` (or `./run.sh` / `make dev`). It runs
pre-flight checks then starts backend + frontend and prints the URLs.

### Non-obvious caveats

- **Use `python3`, not `python`.** There is no `python` alias on the PATH; `run.py`/`run.sh` docs
  say `python run.py` but you must run `python3 run.py`.
- **`.env` is required for the backend to boot.** `config.py` instantiates settings eagerly at
  import and declares `TAVILY_API_KEY` / `SERPER_API_KEY` / `FIRECRAWL_API_KEY` as required fields.
  They may be empty, but the variables must exist. Copy `.env.example` to `.env` (the update script
  does not do this because `.env*` is gitignored — create it once if missing). Real keys are only
  needed when actually calling the search/research pipeline.
- **Ollama and real API keys are optional for local dev.** Ollama is not installed; embeddings fall
  back to ChromaDB's built-in model, so lead storage/dedup and the dashboard work offline. Health
  reports `"ollama": false` and the UI shows "Ollama unavailable — dedup disabled"; this is expected.
- **`source: "test"` leads are blocked** unless `LEADS_ALLOW_TEST_LEADS=1`. When manually exercising
  `POST /api/v1/score`, use a realistic source (e.g. `kvr_audio`) or storage returns 500.
- **Frontend `npm run lint` is broken** due to a dependency incompatibility (ESLint 10 vs the
  `react/display-name` rule bundled in `eslint-config-next`). This is pre-existing and unrelated to
  setup; CI does not run frontend lint (only `next build`). Backend lint (`ruff`) works.
- **The outreach TS packages must be built before use.** `pnpm test` builds them automatically;
  to run the CLI directly, run `pnpm build` first. The dashboard's `opportunities` page reads the
  outreach SQLite DB directly via `node:sqlite` (not through the Python backend).
