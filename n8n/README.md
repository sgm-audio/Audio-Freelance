# n8n — "Refusal of Service" Protocol

n8n is the **Conductor, not the Orchestra**. It does IO + orchestration only.
All heavy compute lives in the FastAPI backend (`backend:` service, `/api/v1/*`).
State lives in ChromaDB (leads) + SQLite/Postgres (outreach). Triggers are
webhooks + a Redis queue. n8n's job: pass the butter.

## The five refusals → where they live

| # | Refusal | Implemented in |
|---|---------|---------------|
| 1 | **No compute in the canvas** | Every workflow is Webhook → `HTTP Request` → Respond. Heavy lifting (scoring, search, LLM drafts, triage) runs in Python at `{{ $env.BACKEND_API_URL }}`. Zero JS loops over data. |
| 2 | **No monolith** | 10 atomic workflows in `n8n/workflows/`. `09_client_onboarding` is just five `Execute Workflow` nodes in a row. |
| 3 | **No fragile webhooks** | `08_queue_ingest` consumes `leads.ingest` from Redis. API gateway → `redis PUBLISH` → n8n. Queue holds data if n8n is down. |
| 4 | **No magic numbers** | All config via env vars: `BACKEND_API_URL`, `API_KEY`, `ERROR_WEBHOOK_URL`, `HIVYR_PROD_DB`, `REDIS_HOST`. Injected in `docker-compose.yml` + `.env.example`. No IDs/keys hardcoded in any workflow. |
| 5 | **No guessing "what happened"** | `00_error_log` (Error Trigger) is wired as `errorWorkflow` on every workflow. On failure it dumps workflow + `AF-ERR-<ts>` code + failed node + execution JSON to `{{ $env.ERROR_WEBHOOK_URL }}`. |

## Workflow catalog (`n8n/workflows/`)

| File | Name | Trigger | Calls backend |
|------|------|---------|---------------|
| `00_error_log.json` | AF · Error Logger | Error Trigger | `POST {{ $env.ERROR_WEBHOOK_URL }}` |
| `01_ingest_lead.json` | AF · Ingest Lead | Webhook `POST /ingest` | `POST /api/v1/leads/manual` |
| `02_score_lead.json` | AF · Score Lead | Webhook `POST /score` | `POST /api/v1/score` |
| `03_translate_capability.json` | AF · Translate | Webhook `POST /translate` | `POST /api/v1/translate` |
| `04_generate_outreach.json` | AF · Generate Outreach | Webhook `POST /outreach` | `POST /api/v1/outreach/{lead_id}` |
| `05_triage_reply.json` | AF · Triage Reply | Webhook `POST /triage` | `POST /api/v1/tracking/triage` |
| `06_run_pipeline.json` | AF · Run Pipeline | Webhook `POST /pipeline` | `POST /api/v1/prospect/{niche}` |
| `07_update_crm.json` | AF · Update CRM | Webhook `POST /crm-update` | `POST /api/v1/leads/{lead_id}/status` |
| `08_queue_ingest.json` | AF · Queue Ingest (Redis) | Redis `leads.ingest` | → `01_ingest_lead` |
| `09_client_onboarding.json` | AF · Client Onboarding | Webhook `POST /onboarding` | → `01→02→03→04→07` |

## Architecture

```
Client / API Gateway
        │  (HTTP POST with lead JSON)
        ▼
   [ Redis pub/sub ]  leads.ingest   ← decoupled ingestion (Refusal #3)
        │
        ▼
   n8n: 08_queue_ingest  ──Exec Workflow──▶ 01_ingest_lead
        │                                           │
        │  OR direct webhook (non-critical)         ▼
        │                               FastAPI backend (Python/Pandas/NumPy/Librosa)
        │                                           │  heavy compute, returns JSON
        ▼                                           ▼
   n8n: 09_client_onboarding ──▶ 02 score → 03 translate → 04 outreach → 07 crm
        │
        ▼
   Respond to caller

On ANY node failure → 00_error_log dumps execution JSON to ERROR_WEBHOOK_URL
```

## Import & run

```bash
# 1. Bring up the stack (Redis + n8n + backend)
cp .env.example .env          # fill API_KEY, ERROR_WEBHOOK_URL, etc.
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d redis n8n backend

# 2. Import workflows (one POST per file, or use n8n UI → Workflows → Import)
for f in n8n/workflows/*.json; do
  curl -u "$N8N_USER:$N8N_PASSWORD" -X POST \
    "http://localhost:5678/api/v1/workflows" \
    -H "Content-Type: application/json" \
    --data-binary "@$f"
done

# 3. Attach the Redis credential in the n8n UI to node `08_queue_ingest`
#    (host=redis, port=6379). Env vars are already injected by docker-compose.
```

## Required env vars (`.env`)

- `BACKEND_API_URL` — where the Python microservice listens
- `API_KEY` — Bearer token sent to every backend call
- `ERROR_WEBHOOK_URL` — Discord/Slack webhook for the error sink
- `HIVYR_PROD_DB` — production DB string (abstracted, not inlined anywhere)
- `N8N_USER` / `N8N_PASSWORD` / `N8N_ENCRYPTION_KEY` — n8n auth

## Notes / ceilings

- `08_queue_ingest` Redis connection uses an n8n Redis credential (host `redis`);
  set it once in the UI. The channel name `leads.ingest` is the only hardcoded
  constant — change it in one place if needed.
- Execute-Workflow data plumbing in `09_client_onboarding` passes `$json` through;
  tune field mapping per backend response if a step needs a specific field.
- Error logger posts to Discord webhook. For Postgres/Supabase logging instead,
  point `ERROR_WEBHOOK_URL` at a logging endpoint or add an INSERT step.
