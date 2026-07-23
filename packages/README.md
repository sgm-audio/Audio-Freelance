# Outreach packages (spec §2)

| Package | Milestone | Role |
|---|---|---|
| `core` | M0 | Domain types, state machine, SQLite |
| `ingest` | M1 | Sources: appstore, salesnav CSV, upwork RSS, jobboards |
| `enrich` | M2 | Playwright scrape → LLM facts → contact finder |
| `score` | M2 | Deterministic scoring (no LLM) |
| `ops` | M5 | Metrics, reply/bounce webhooks, staging dry-run |
| `send` | M4 | Resend email send, CASL footer, unsubscribe |
| `cli` | M0+ | `sgm-outreach` entrypoint |
