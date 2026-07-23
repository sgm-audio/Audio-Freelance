import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { assertDryRunOk, runDryRun } from "@sgm-outreach/ops";
import { defaultDbPath } from "./status.js";

function flagValue(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i === -1) return undefined;
  return argv[i + 1];
}

/**
 * Offline staging dry-run: 10 fixture leads, mock send, prove suppression.
 * Does not call Resend. Forces SGM_OUTREACH_STAGING=1 for the run.
 */
export function runDryRunCommand(argv: string[]): void {
  const dbPath =
    flagValue(argv, "--db") ??
    defaultDbPath().replace(/outreach\.sqlite$/i, "outreach-dry-run.sqlite");
  mkdirSync(dirname(dbPath), { recursive: true });
  const report = runDryRun(dbPath);
  assertDryRunOk(report);
  console.log("SGM Outreach dry-run (staging / mocks)");
  console.log(`db: ${dbPath}`);
  console.log(report.summary_table);
  console.log("");
  console.log(
    `sent=${report.sent_count} blocked=${report.blocked_count} pause_gate=${report.paused_blocks_send ? "ok" : "FAIL"}`,
  );
}
