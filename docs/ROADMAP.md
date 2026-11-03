# Roadmap

> The public plan for Audio-Freelance. For the raw working backlog see
> [`planning/BACKLOG.md`](planning/BACKLOG.md); for detailed acceptance
> criteria on the UX track see [`planning/UX_PRODUCT_ROADMAP.md`](planning/UX_PRODUCT_ROADMAP.md).

**Vision:** a local-first *freelance acquisition system* — find, qualify, and
reach out to the right clients without a carpet-bombing your inbox or manually
refreshing fifteen job boards. The audio-engineering niches are the current
ground truth; the architecture is niche-agnostic.

**Design principles** (contributions are held to these):

1. **Local-first** — your lead data never leaves your machine; cloud calls are
   search APIs you control the keys for.
2. **No silent failures** — every degraded path logs; the dashboard says why.
3. **Compliance is architecture** — no LinkedIn automation, no ToS-breaking
   scrapers. See `docs/outreach/OUTREACH_BUILD_SPEC.md` §1.
4. **Boring stack** — FastAPI, Next.js, ChromaDB, SQLite. No new dependency
   without a fight.

---

## Where we are — v0.1.x

Shipped and working:

- 5-tier search (Tavily → Serper → Firecrawl fallback chain) + direct ATS
  integrations (Greenhouse, Lever, Ashby)
- ChromaDB lead store with embedding dedup and cold-lead rotation
- Profile-based scoring (HOT/WARM/COLD) driven by your own profile
- LLM outreach drafting with a claims allowlist + banlist (no invented
  capabilities, ever)
- Next.js dashboard: leads pipeline, market intelligence, outreach console
- Prometheus metrics, Sentry, structlog JSON logs
- Docker + Fly.io deployment, CI on Python 3.12/3.13 + Node 22

## Now — targeting v0.2 (UX hardening, "8/10" milestone)

| Item | Status |
|---|---|
| Leads list text search, sort control | ✅ Done |
| Undo toast for status changes | ✅ Done |
| Accessible modals (focus trap, ESC) | ✅ Done |
| Server pagination + list virtualization | Open — good issue to pick up |
| Bulk select + bulk status change (with batch undo) | Open |
| Shared toast/alert component across all pages | Open |
| axe-core accessibility CI gate | Open |
| Playwright E2E for the leads workflow | Open |

## Next — platform expansion

- **Feed ingestion tier** (RSS/Atom: We Work Remotely, RemoteOK, HN "Who is
  hiring") as search tier 6
- **Email ingest**: paste/forward a job email → parsed lead
- **ATS autodiscovery**: enter a company, we find its public job board
- **Saved searches as scheduled probes** with new-hit notifications
  (Telegram/webhook — plumbing exists)
- **Daily digest email** using the existing `/briefing` template
- **Lead timeline** (status history, notes) on SQLite

## Later — the big bets

- **Win/loss feedback loop**: marking WON/LOST retrains scoring weights;
  scorer ships with a documented ModelCard
- **Industry packs**: scoring+signal vocab as swappable packs (audio DSP,
  embedded, firmware, game dev)
- **Industry packages** for other freelance verticals
- **Multi-user/RBAC** — only after a second human actually wants it
- **Desktop app decision**: finish or delete the Tauri shell (currently in
  flight)

## How to help

See [CONTRIBUTING.md](../CONTRIBUTING.md) for setup and scope. The best
entry points right now:

- **Search tier sources** — new job boards/feeds that fit the compliance rules
- **Market intelligence signals** — new categories for the scanner
- **Dashboard UX** — any row in the "Now" table above

Open an issue before starting large work; it keeps scope honest and prevents
duplicate effort.
