#!/usr/bin/env node
import { runApproveCommand } from "./approve.js";
import { runDraftCommand } from "./draft.js";
import { runDryRunCommand } from "./dry-run.js";
import { runEnrichCommand, runScoreCommand } from "./enrich.js";
import { runFollowupCommand } from "./followup.js";
import { runAddCompanyCommand, runIngestCommand } from "./ingest.js";
import { runMetricsCommand } from "./metrics.js";
import { runQueueCommand } from "./queue.js";
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
  draft          SCORED → draft → PENDING_APPROVAL (DeepSeek/Ollama/fixtures)
  approve        Digest / approve / reject / edit / webhook serve
  send           Send APPROVED email leads via Resend (CASL + suppressions)
  queue          Paste-only linkedin|upwork queue (NO auto-send)
  followup       Day-4/10/60 follow-up runner (--once / --dry-run)
  metrics        Sent / replies / bounces by day + segment
  webhook        Reply/bounce receiver (serve | handle)
  dry-run        Staging dry-run: 10 fixture leads, mock send, suppression proof

draft options:
  --fixtures        Use offline fixture drafter (no LLM)
  --claims <path>   claims.json (default: ./config/claims.json)
  --limit <n>       Max SCORED leads
  --db <path>

approve subcommands:
  digest [--push]              Print PENDING_APPROVAL digest (optional webhook)
  <draftId>                    Approve draft → APPROVED
  reject <draftId> [--reason]
  edit <draftId> --body <text> [--subject <s>]
  serve [--port 8788]          n8n webhook receiver

queue:
  queue linkedin|upwork [--db path]

followup options:
  --once / --dry-run   Run one pass (dry-run = no DB writes)
  --now <ISO>          Mock clock
  --db <path>
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
    case "draft": {
      await runDraftCommand(argv);
      return;
    }
    case "approve": {
      await runApproveCommand(argv);
      return;
    }
    case "send": {
      await runSendCommand(argv);
      return;
    }
    case "queue": {
      runQueueCommand(argv);
      return;
    }
    case "followup": {
      runFollowupCommand(argv);
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
