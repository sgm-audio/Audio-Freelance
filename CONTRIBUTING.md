# Contributing to Audio-Freelance

Welcome! We're building a local-first lead acquisition pipeline for freelance
engineers. Contributions are welcome — this guide keeps your PR from stalling.

## Core Principles

- **Performance first** — minimize latency and resource usage.
- **Type safety** — strict typing in Python (mypy) and TypeScript.
- **Local-first** — user data stays on the user's machine; local
  LLM/embeddings (Ollama) preferred.
- **No silent failures** — every degraded path logs; never `except: pass`
  without a log line.
- **Compliance is architecture** — no scraping or automation that violates a
  platform's ToS (see `docs/outreach/OUTREACH_BUILD_SPEC.md` §1).

## Where to contribute

Check the [Roadmap](docs/ROADMAP.md) — the "Now" table is the best place to
start. In scope:

- **Bug fixes** — always welcome
- **Search tier / feed sources** — new job boards, RSS feeds (ToS-respecting)
- **Market intelligence** — new signal categories or APIs
- **Dashboard UX** — accessibility, bulk operations, list scalability

Out of scope:

- New ML model training pipelines (this is a search/scoring system)
- Multi-user/SaaS features (tracked as a "Later" roadmap item)

**Open an issue before large work.** It prevents duplicate effort and scope
drift.

## Development setup

```bash
cp .env.example .env          # add at least one search API key
ollama pull nomic-embed-text  # embedding model for dedup
make install                  # uv sync + npm install
python run.py                 # backend :8080 + frontend :3000
```

Verify: `make test` (157 tests) and `make build`.

## Conventions

- **Lint** — `uv run ruff check .` (zero errors expected)
- **Typecheck** — `uv run mypy .` and `cd frontend && npx tsc --noEmit`
- **Commits** — conventional commits: `feat:`, `fix:`, `chore:`, `docs:`
- **Tests** — put new tests in `tests/`; embedding-critical code paths must
  work deterministically (see `LEADS_DISABLE_OLLAMA` in `tests/conftest.py`)

## Parallel work with worktrees

If you run parallel tracks, keep worktrees **outside** the repo directory so
tooling scans don't pick them up:

```bash
git worktree add ../af-my-feature my-feature
```

(There are legacy nested worktrees at `branch1..4`/`reviews/`; these are
gitignored but will eventually be relocated.)

## PR requirements

- One change per PR
- `make test` passes, frontend builds (`make build`), ruff clean
- No new dependencies without justification in the PR description
- Update `README.md` / `docs/` if the API surface changes

## Security

Reporting anything sensitive goes to [SECURITY.md](SECURITY.md) — do not open
a public issue for vulnerabilities.
