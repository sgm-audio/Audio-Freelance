#!/usr/bin/env node
import { runDryRunCommand } from "./dry-run.js";
import { runEnrichCommand, runScoreCommand } from "./enrich.js";
import { runAddCompanyCommand, runIngestCommand } from "./ingest.js";
import { runMetricsCommand } from "./metrics.js";
import { runSendCommand } from "./send.js";
import {
  formatStatus,
  loadStatus,
  pauseSends,
  resumeSends,
} from "./status.js";
import { runWebhookCommand } from "./webhook.js";

function usage(): never {
  console.error(`Usage: sgm-outreach <command>

Commands:
  status         Print pipeline counts (empty pipeline is valid)
  pause          Kill switch — halt all sends globally
  resume         Clear kill switch
  ingest         Run ingest sources (appstore, salesnav, upwork, jobboards)
  add-company    Manually add a company + NEW lead
  enrich         Scrape + LLM facts + contacts (NEW → ENRICHED)
  score          Deterministic scoring (ENRICHED → SCORED)
  send           Send APPROVED email leads via Resend (CASL + suppressions)
  metrics        Sent / replies / bounces by day + segment
  webhook        Reply/bounce receiver (serve | handle)
  dry-run        Staging dry-run: 10 fixture leads, mock send, suppression proof

ingest options:
  --source <name>   appstore|salesnav|upwork|jobboards|all  (default: all)
  --live            Enable Playwright live jobboard scrape (off by default)
  --inbox <dir>     Sales Nav CSV inbox (default: ./inbox)
  --fixtures <dir>  Load packages/ingest/fixtures instead of live/inbox
  --config <path>   ingest config JSON (default: ./config/ingest.json)
  --db <path>       SQLite path (default: ./data/outreach.sqlite or SGM_OUTREACH_DB)

add-company options:
  --name <name> --domain <domain> [--segment music-tech] [--tier 1] [--channel email]

enrich options:
  --fixtures <dir>  Offline HTML + fixture-facts (packages/enrich/fixtures)
  --live            Playwright scrape live company sites (needs DeepSeek or Ollama)
  --limit <n>       Max NEW leads to enrich (default: 100)
  --score           Also run score after enrich
  --db <path>       SQLite path

score options:
  --limit <n>       Max ENRICHED leads to score (default: 100)
  --db <path>       SQLite path

send options:
  --limit <n>       Max APPROVED email leads to send (default: 50)
  --db <path>       SQLite path
  --listen-unsub    Also serve GET /unsubscribe (port via --port, default 8791)
  --port <n>        Unsubscribe listen port

metrics options:
  --days <n>        Lookback window (default: 30)
  --segment <name>  Filter by company segment
  --json            Machine-readable output
  --db <path>       SQLite path

webhook subcommands:
  serve [--port 8787] [--host 127.0.0.1] [--db path]
  handle [--db path]   Read JSON event from stdin

dry-run options:
  --db <path>       SQLite path (default: ./data/outreach-dry-run.sqlite)
`);
  process.exit(1);
}

async function main(argv: string[]): Promise<void> {
  const cmd = argv[2];
  if (!cmd) usage();
  switch (cmd) {
    case "status": {
      console.log(formatStatus(loadStatus()));
      return;
    }
    case "pause": {
      pauseSends();
      console.log("paused: YES — all sends halted");
      return;
    }
    case "resume": {
      resumeSends();
      console.log("paused: no — sends allowed");
      return;
    }
    case "ingest": {
      await runIngestCommand(argv);
      return;
    }
    case "add-company": {
      runAddCompanyCommand(argv);
      return;
    }
    case "enrich": {
      await runEnrichCommand(argv);
      return;
    }
    case "score": {
      runScoreCommand(argv);
      return;
    }
    case "send": {
      await runSendCommand(argv);
      return;
    }
    case "metrics": {
      runMetricsCommand(argv);
      return;
    }
    case "webhook": {
      await runWebhookCommand(argv);
      return;
    }
    case "dry-run": {
      runDryRunCommand(argv);
      return;
    }
    case "help":
    case "--help":
    case "-h":
      usage();
      break;
    default:
      console.error(`Unknown command: ${cmd}`);
      usage();
  }
}

main(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
