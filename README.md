<p align="center">
  <h1 align="center">◆ Audio-Freelance</h1>
  <p align="center">Automated lead sourcing, scoring, and market intelligence<br />for freelance audio/DSP/plugin developers.</p>
</p>

<p align="center">
  <a href="#features">Features</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#api">API</a> ·
  <a href="#market-intelligence">Market Intelligence</a> ·
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/python-3.12%2B-blue" alt="Python">
  <img src="https://img.shields.io/badge/next.js-16-black" alt="Next.js">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
</p>

---

<p align="center">
  <img src="frontend/public/dashboard.png" alt="Dashboard" width="800">
</p>

---

**Audio-Freelance** is a full-stack system that finds freelance audio development work — not by scraping job boards, but by mining market intelligence: funding rounds, technology trends, product launches, hiring signals, and pricing data. It scores leads, tracks opportunities, and generates outreach drafts.

Built for audio DSP engineers, plugin developers, and audio ML engineers who want to spend less time hunting and more time coding.

## Features

**Search & Score** — Multi-tier search across KVR Audio, JUCE Forum, Reddit, HN, GitHub, LinkedIn, and company career pages. Scored by signal detection (C++/Rust DSP, CLAP, Mamba/SSM, REAPER, on-device ML, etc.) with configurable thresholds.

**Market Intelligence** — 6-category market scanner: funding rounds, technology trends, product launches, pricing benchmarks, hiring signals, and GitHub activity. Tracks 14+ technologies (CLAP, ARA, Mamba/SSM, Rust Audio, JUCE, etc.) with rising/stable/declining status.

**Outreach Generator** — Templated outreach drafts (A-D) with asset registry claim validation. Proposal generator with pricing tiers and IP licensing notes. Ready-to-send application materials for live opportunities.

**Dashboard** — Next.js 16 dark-mode dashboard with lead management, market trends, pricing benchmarks, and one-click prospecting. Theme toggle, keyboard navigable.

## Quick Start

```bash
# Install backend + frontend dependencies
make install

# Start both servers
./run.sh
# or: make dev
```

Then open **http://localhost:3000**

### Prerequisites

- Python 3.12+
- Node.js 22+
- [Ollama](https://ollama.ai) with `nomic-embed-text` (for dedup)
- Search API keys (Tavily, Serper, or Firecrawl) — set in `.env`

```bash
cp .env.example .env
# Add your API keys
ollama pull nomic-embed-text
```

### Individual Commands

```bash
make backend    # FastAPI on :8080
make frontend   # Next.js on :3000
make test       # Run 65 backend tests
make build      # Production frontend build
```

## Architecture

```
audio-freelance/
├── main.py              # FastAPI server + dashboard
├── api/routes.py        # REST endpoints
├── leads/               # Data layer (Pydantic models + ChromaDB)
├── search/              # Multi-tier search (Tiers 1-4)
├── scoring/             # Signal detection + lead scoring
├── research/            # Market intelligence engine
├── generate/            # Outreach + proposal generators
├── assets/              # Portfolio claim registry
├── debug/               # Diagnostics
└── frontend/            # Next.js dashboard
    ├── src/app/         # Pages (dashboard, leads, market, opportunities)
    ├── src/lib/api.ts   # Typed API client
    └── src/components/  # UI components (shadcn)
```

### Search Tiers

| Tier | Frequency | Sources |
|------|-----------|---------|
| Tier 1 | Daily | KVR Audio, JUCE Forum, Reddit (audio_programming, REAPER) |
| Tier 2 | Weekly | We Work Remotely, RemoteOK, Wellfound, HN Algolia |
| Tier 3 | Niche | Audio Programmer, GitHub bounties, music-tech boards |
| Tier 4 | Outbound | Plugin companies, YC audio startups, AI-audio startups |

## API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/health` | Health check |
| `GET` | `/api/v1/status` | Lead counts + system status |
| `GET` | `/api/v1/leads` | List leads (filterable by status) |
| `POST` | `/api/v1/prospect/{niche}` | Search → dedup → score pipeline |
| `POST` | `/api/v1/score` | Manually score a raw candidate |
| `POST` | `/api/v1/translate` | Tech capability → client pitch |
| `POST` | `/api/v1/outreach/{lead_id}` | Generate outreach draft |
| `POST` | `/api/v1/proposal` | Generate structured proposal |
| `POST` | `/api/v1/rate` | Rate tiers for a task |
| `GET` | `/api/v1/market` | Full market intelligence report |
| `GET` | `/api/v1/market/trends` | Technology trends |
| `GET` | `/api/v1/market/pricing` | Pricing benchmarks |
| `GET` | `/api/v1/market/opportunities` | Actionable opportunities |
| `POST` | `/api/v1/debug` | Run diagnostics |
| `GET` | `/briefing` | Plain-text daily briefing |
| `POST` | `/dispatch` | Email briefing to configured address |

## Market Intelligence

The `research/market.py` engine searches 6 signal categories in parallel:

| Category | What it finds |
|----------|--------------|
| **Funding** | Companies that raised money (hiring soon) |
| **Tech Trends** | CLAP, Mamba/SSM, Rust Audio, ARA adoption |
| **Product Launches** | New plugins, DAW features, AI music tools |
| **Pricing** | Rate data from job posts and freelance platforms |
| **Hiring Signals** | Companies actively building audio teams |
| **GitHub Trending** | What's being built in audio open source |

### Tracked Technologies

CLAP, ARA 2, Mamba/SSM, Rust Audio, ONNX, LibTorch, REAPER, Web Audio, Neural Audio Codecs, Source Separation, FAUST, JUCE, RTNeural, MIR.

## License

MIT — see [LICENSE](LICENSE).

---

<p align="center">
  Built by <a href="https://github.com/scottmills306">@scottmills306</a>
</p>
