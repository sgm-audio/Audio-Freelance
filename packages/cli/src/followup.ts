import { runFollowup } from "@sgm-outreach/followup";
import { openAndMigrate } from "@sgm-outreach/core";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { defaultDbPath } from "./status.js";

function parseFlag(argv: string[], name: string): string | undefined {
  const idx = argv.indexOf(name);
  if (idx < 0) return undefined;
  return argv[idx + 1];
}

function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(name);
}

/** `sgm-outreach followup --once [--dry-run] [--now ISO]` */
export function runFollowupCommand(argv: string[]): void {
  if (!hasFlag(argv, "--once") && !hasFlag(argv, "--dry-run")) {
    // default to once
  }
  const dbPath = parseFlag(argv, "--db") ?? defaultDbPath();
  const dryRun = hasFlag(argv, "--dry-run");
  const nowRaw = parseFlag(argv, "--now");
  const now = nowRaw ? new Date(nowRaw) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error(`Invalid --now: ${nowRaw}`);

  mkdirSync(dirname(dbPath), { recursive: true });
  const db = openAndMigrate(dbPath);
  try {
    const result = runFollowup({ db, now, dryRun });
    console.log(
      `followup: ${result.actions.length} action(s), no_reply_marked=${result.marked_no_reply.length}${dryRun ? " (dry-run)" : ""}`,
    );
    for (const a of result.actions) {
      console.log(
        `  ${a.kind} lead=${a.lead_id}` +
          (a.draft_id ? ` draft=${a.draft_id}` : "") +
          (a.dry_run ? " dry-run" : ""),
      );
    }
  } finally {
    db.close();
  }
}
