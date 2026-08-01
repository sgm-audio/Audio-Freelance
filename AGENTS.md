# Audio-Freelance — Agent Instructions

## Quick Commands

| Task | Command |
|------|---------|
| Install all deps | `make install` (uv sync + npm install) |
| Start dev (both) | `python run.py` (or `make dev` / `./run.sh`) |
| Backend only | `make backend` → FastAPI on :8080 |
| Frontend only | `make frontend` → Next.js on :3000 |
| Run tests | `make test` (65+ pytest tests) |
| Build frontend | `make build` → `npx next build` |
| Lint | `uv run --with ruff ruff check .` |
| Typecheck | `uv run --with mypy mypy .` |
| Clean | `make clean` |
| Release | `make release V=v0.2.0` (tags + pushes) |

## Environment Setup

```bash
cp .env.example .env
# Required: TAVILY_API_KEY, SERPER_API_KEY, or FIRECRAWL_API_KEY
# Optional: API_KEY (auth), GITHUB_TOKEN, OLLAMA_HOST, SENTRY_DSN
ollama pull nomic-embed-text  # for embeddings dedup
```

Windows: use `activate.ps1` / `activate.bat` / `activate.sh` to enter uv venv.

## Architecture

- **Backend**: FastAPI (Python 3.12+) on :8080 — `main.py` entrypoint
- **Frontend**: Next.js 16 (React 19) on :3000 — `frontend/` directory
- **Vector DB**: ChromaDB (collections: `freelance_leads`, `freelance_outreach_log`)
- **Embeddings**: Ollama `nomic-embed-text` (fallback: sentence-transformers)
- **Pipeline**: LangGraph DAG — search → dedup → score → generate → review
- **Search APIs**: Tavily (primary), Serper, Firecrawl (fallbacks)

## Key Directories

```
api/          # FastAPI routes
graph/        # LangGraph pipeline nodes
leads/        # Lead store (ChromaDB wrapper)
search/       # 4-tier search implementations
scoring/      # Signal scoring engine
generate/     # LLM outreach/proposal generation
research/     # Market intelligence scanner
assets/       # Asset registry (asset_registry.yml)
packages/     # pnpm monorepo (outreach CLI packages)
frontend/     # Next.js dashboard
tests/        # 65+ pytest tests
```

## Testing

```bash
# All tests
make test

# Single test file
uv run --with pytest --with pytest-asyncio pytest tests/test_score.py -v

# With coverage
uv run --with pytest --with pytest-asyncio --with pytest-cov pytest tests/ --cov
```

Tests use `asyncio_mode = auto`, `pythonpath = ["."]`, fixtures in `conftest.py`.

## Linting / Formatting

```bash
uv run --with ruff ruff check .       # lint
uv run --with ruff ruff format .      # format
```

Config in `pyproject.toml`: line-length 100, double quotes, target py312. Per-file ignores for long lines in search/generate/scripts.

## Type Checking

```bash
uv run --with mypy mypy .
```

Mypy config ignores many errors in external-facing modules (leads.store, graph.pipeline, research.sources, search.*).

## CI Pipeline (GitHub Actions)

Runs on push/PR to main:
1. **lint** — ruff check
2. **test-backend** — pytest on Python 3.12 + 3.13 with coverage
3. **build-frontend** — `npx next build` (Node 22)
4. **docker** — builds/pushes to GHCR (on tags + master branch)

## Deployment

- **Fly.io**: `fly deploy` (configured in `fly.toml`, needs `FLY_API_TOKEN` secret)
- **Docker Compose**: `docker compose up -d` (dev) / `-f docker-compose.prod.yml` (prod)
- **Version tags**: `git tag v0.1.3 && git push origin v0.1.3` triggers CD

## Gotchas

- `run.py` does pre-flight checks (uv, node, npm, ollama, .env, ports) — use `--check` to verify only
- Ports 3000/8080 must be free; `run.py --force` kills existing listeners
- Frontend uses Next.js 16 (breaking changes) — see `frontend/AGENTS.md`
- No frontend unit tests (legacy); only Playwright E2E: `npm run test:e2e` in `frontend/`
- pnpm workspace at `packages/` — outreach CLI packages (core, ingest, enrich, score, ops, send, cli)
- ChromaDB data in `data/` (gitignored); backup via `scripts/backup.sh --retain 7`