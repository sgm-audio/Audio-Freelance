import {
  listFactsForCompany,
  listLeadsByState,
  openAndMigrate,
  type OutreachDb,
} from "@sgm-outreach/core";
import { runEnrich } from "@sgm-outreach/enrich";
import { runScore } from "@sgm-outreach/score";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { defaultDbPath } from "./status.js";

function parseFlag(argv: string[], name: string): string | undefined {
  const idx = argv.indexOf(name);
  if (idx < 0) return undefined;
  return argv[idx + 1];
}

function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(name);
}

function parseLimit(argv: string[]): number | undefined {
  const raw = parseFlag(argv, "--limit");
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`Invalid --limit: ${raw}`);
  }
  return n;
}

function loadFixtures(fixtureDir: string) {
  const sites = JSON.parse(
    readFileSync(resolve(fixtureDir, "company-sites.json"), "utf8"),
  ) as Record<string, { pages: Record<string, string> }>;
  const fixtureFacts = JSON.parse(
    readFileSync(resolve(fixtureDir, "fixture-facts.json"), "utf8"),
  ) as Record<string, unknown>;
  return { fixtures: sites, fixtureFacts };
}

export async function runEnrichCommand(argv: string[]): Promise<void> {
  const dbPath = parseFlag(argv, "--db") ?? defaultDbPath();
  const limit = parseLimit(argv);
  const live = hasFlag(argv, "--live");
  const fixtureDir = parseFlag(argv, "--fixtures");
  const alsoScore = hasFlag(argv, "--score");
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = openAndMigrate(dbPath);
  try {
    const loaded = fixtureDir ? loadFixtures(resolve(fixtureDir)) : undefined;
    if (!loaded && !live) {
      console.error(
        "enrich: no --fixtures and no --live. Offline fixture mode requires --fixtures <dir>.",
      );
      console.error(
        "Live mode needs DEEPSEEK_API_KEY or a running Ollama server, then pass --live.",
      );
      process.exit(1);
    }
    if (live && !loaded) {
      if (!process.env["DEEPSEEK_API_KEY"]?.trim()) {
        console.log(
          "note: DEEPSEEK_API_KEY unset — will try Ollama at OLLAMA_URL (default http://127.0.0.1:11434)",
        );
      }
    }
    const enrichResult = await runEnrich({
      db,
      ...(limit !== undefined ? { limit } : {}),
      ...(loaded
        ? { fixtures: loaded.fixtures, fixtureFacts: loaded.fixtureFacts }
        : {}),
      ...(live ? { live: true } : {}),
    });
    console.log("SGM Outreach — enrich complete");
    console.log(`db: ${dbPath}`);
    console.log(`mode: ${loaded ? "fixtures" : "live"}`);
    console.log(
      `selected=${enrichResult.selected} enriched=${enrichResult.enriched} manual=${enrichResult.manual} failed=${enrichResult.failed}`,
    );
    console.log(
      `facts_added=${enrichResult.facts_added} contacts_added=${enrichResult.contacts_added}`,
    );
    for (const err of enrichResult.errors) {
      console.log(`  error lead=${err.lead_id}: ${err.error}`);
    }
    if (alsoScore) {
      const scoreResult = runScore({
        db,
        ...(limit !== undefined ? { limit } : {}),
      });
      console.log(`score: scored=${scoreResult.scored.length}`);
      printScoredSummary(db, scoreResult.scored.length);
    }
  } finally {
    db.close();
  }
}

export function runScoreCommand(argv: string[]): void {
  const dbPath = parseFlag(argv, "--db") ?? defaultDbPath();
  const limit = parseLimit(argv);
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = openAndMigrate(dbPath);
  try {
    const result = runScore({
      db,
      ...(limit !== undefined ? { limit } : {}),
    });
    console.log("SGM Outreach — score complete");
    console.log(`db: ${dbPath}`);
    console.log(`scored=${result.scored.length}`);
    for (const row of result.scored) {
      console.log(`  lead=${row.lead_id} score=${row.score}`);
    }
    printScoredSummary(db, result.scored.length);
  } finally {
    db.close();
  }
}

function printScoredSummary(db: OutreachDb, justScored: number): void {
  const scored = listLeadsByState(db, "SCORED");
  let withTwoFacts = 0;
  for (const lead of scored) {
    if (listFactsForCompany(db, lead.company_id).length >= 2) withTwoFacts += 1;
  }
  console.log(
    `pipeline: SCORED=${scored.length} with_>=2_facts=${withTwoFacts}` +
      (justScored ? ` (this run=${justScored})` : ""),
  );
}
