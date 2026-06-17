# Contributing

Thanks for your interest. This is a focused tool — not a library —
so contributions are best aligned with the existing scope.

## Scope

- **Bug fixes** — always welcome
- **Search tier improvements** — new job board sources, better queries
- **Market intelligence sources** — new signal categories or APIs
- **Dashboard UI polish** — accessibility, responsive, dark/light

## Not in scope

- New ML model training pipelines (this is a search/scoring system, not a training framework)
- Feature creep that doesn't directly help find freelance work

## Before you start

Open an issue describing what you want to do. Keeps duplicate work
from happening.

## Development

```bash
make install
make test
```

See [README](README.md) for full setup.

## PR guidelines

- One change per PR
- Tests pass (`make test`)
- Frontend builds (`make build`)
- No new unnecessary dependencies
