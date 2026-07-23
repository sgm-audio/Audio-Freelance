# SGM Outreach operator runbook

Cold-start guide for the TypeScript outreach monorepo under `packages/*`.
Commands below were scanned from `packages/cli` after M5. Do not invent extras.

## Prerequisites

```bash
pnpm install
pnpm build
cp .env.example .env   # fill keys locally — never commit secrets
```

SQLite default: `./data/outreach.sqlite` (override with `SGM_OUTREACH_DB`).

Docker profile:

```bash
docker compose --profile outreach up outreach
```

## Pipeline (happy path)

| Step | Command | Notes |
|---|---|---|
| Ingest | `pnpm sgm-outreach ingest --fixtures packages/ingest/fixtures` | Or live sources; Sales Nav = CSV inbox only |
| Enrich | `pnpm sgm-outreach enrich --fixtures packages/enrich/fixtures` | `--live` needs scraper + LLM |
| Score | `pnpm sgm-outreach score` | Deterministic; no LLM |
| Draft | TBD — `packages/draft` (M3) | Email drafts only; LinkedIn = draft/paste, never auto-send |
| Approve | TBD — `packages/approve` (M3) | Human gate → `PENDING_APPROVAL` / `APPROVED` |
| Send | `pnpm sgm-outreach send` | Email via Resend; suppression + pause fail closed |
| Follow-up | TBD — `packages/followup` (M4) | Cadence drafts back through approval |

Status / kill switch (live now):

```bash
pnpm sgm-outreach status
pnpm sgm-outreach pause    # halt all sends globally
pnpm sgm-outreach resume
```

Manual lead:

```bash
pnpm sgm-outreach add-company --name "Acme Audio" --domain acme.example --segment music-tech
```

## Channel rules

- **Email:** automated send only after `APPROVED`, with CASL footer appended by send (not the LLM).
- **LinkedIn / Upwork:** human paste queues only — no Sales Nav scraping, no LinkedIn auto-send.
- **HUMAN** state: pipeline must not touch the lead after a reply.

## Staging + sink

| Env | Purpose |
|---|---|
| `SGM_OUTREACH_STAGING=1` | Redirect sends to sink (keep on until go-live) |
| `SGM_OUTREACH_SINK_EMAIL` | Sink inbox |
| `SGM_OUTREACH_FROM_EMAIL` | Verified Resend from-address |
| `SGM_OUTREACH_UNSUBSCRIBE_BASE_URL` | CASL unsubscribe base |
| `RESEND_API_KEY` | Send provider (empty = no live send) |
| `DEEPSEEK_API_KEY` | Enrich/draft LLM (optional if fixtures/Ollama) |

## M5 metrics + webhooks (live now)

```bash
pnpm sgm-outreach metrics
pnpm sgm-outreach metrics --days 14 --segment music-tech
pnpm sgm-outreach metrics --json
```

Reply → `REPLIED` → `HUMAN`. Bounce → `BOUNCED` + suppression row.

```bash
# HTTP receiver (Resend or simple JSON)
pnpm sgm-outreach webhook serve --port 8787

# One-shot from stdin
echo {"kind":"reply","email":"lead@example.com"} | pnpm sgm-outreach webhook handle
echo {"kind":"bounce","email":"gone@example.com","reason":"hard-bounce"} | pnpm sgm-outreach webhook handle
```

Endpoint: `POST /webhooks/resend` — also accepts `{"kind":"reply"|"bounce","email":"…"}`.

## Staging dry-run (live now)

Offline, no API keys. Seeds 10 fixtures, mock-sends 9, proves suppressed address blocked:

```bash
pnpm sgm-outreach dry-run
# or
pnpm outreach:dry-run
# or
node scripts/outreach-dry-run.mjs
```

## Daily 15-minute approval ritual

1. `pnpm sgm-outreach status` — confirm not paused accidentally; note `PENDING_APPROVAL`.
2. Review drafts in the approve UI/CLI once M3 lands (Telegram/n8n digest via `N8N_APPROVAL_WEBHOOK_URL`).
3. Approve only honest, claim-allowlisted copy (`config/claims.json`).
4. Keep `SGM_OUTREACH_STAGING=1` until sink dry-runs look clean.
5. `pnpm sgm-outreach metrics --days 7` — scan bounces; investigate spikes.

## Weekly eval targets (§8 failure modes)

Track weekly (metrics + manual notes):

| Signal | Watch for |
|---|---|
| Bounce rate | Rising bounces → list hygiene / suppression gaps |
| Reply → HUMAN lag | Should be instant via webhook |
| Pause misuse | Kill switch left on (no sends) or off during incidents |
| Claim drift | Drafts citing unlisted claims — fix `config/claims.json` + reject |
| LinkedIn automation | Any auto-send path is a ship blocker — none allowed |

## Honest claims

`config/claims.json` is the allowlist. Portamento is **in progress only** — never claim shipped. TrackClear / makingmadi / 17 years are the other allowed anchors; evidence notes forbid inventing numbers.

## Troubleshooting

| Symptom | Check |
|---|---|
| Empty pipeline | Normal on fresh DB; run ingest fixtures |
| Sends blocked | `status` → paused? suppression table? staging sink set? |
| Webhook 422 | Email not linked to a lead/contact |
| Dry-run fails | Need writable `--db` path; build `packages/ops` first |
