import { runDraft } from "@sgm-outreach/draft";
import { openAndMigrate } from "@sgm-outreach/core";
import { mkdirSync } from "node:fs";
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
  if (!Number.isInteger(n) || n < 1) throw new Error(`Invalid --limit: ${raw}`);
  return n;
}

export async function runDraftCommand(argv: string[]): Promise<void> {
  const dbPath = parseFlag(argv, "--db") ?? defaultDbPath();
  const limit = parseLimit(argv);
  const fixtures = hasFlag(argv, "--fixtures");
  const claimsPath = parseFlag(argv, "--claims");
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = openAndMigrate(dbPath);
  try {
    const result = await runDraft({
      db,
      ...(limit !== undefined ? { limit } : {}),
      ...(claimsPath ? { claimsPath: resolve(claimsPath) } : {}),
      useFixtureDrafter: fixtures || !process.env["DEEPSEEK_API_KEY"]?.trim(),
    });
    if (!fixtures && !process.env["DEEPSEEK_API_KEY"]?.trim()) {
      console.log(
        "note: DEEPSEEK_API_KEY unset — used fixture drafter (pass --fixtures explicitly in CI)",
      );
    }
    console.log(
      `draft: ${result.drafted.length} drafted → PENDING_APPROVAL, ${result.skipped.length} skipped`,
    );
    for (const d of result.drafted) {
      console.log(`  DRAFT ${d.lead_id} draft=${d.draft_id} model=${d.model}`);
    }
    for (const s of result.skipped) {
      console.log(`  SKIP ${s.lead_id} reason=${s.reason}`);
    }
  } finally {
    db.close();
  }
}
