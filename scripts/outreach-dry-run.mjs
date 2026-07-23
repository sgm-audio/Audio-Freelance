#!/usr/bin/env node
/**
 * Convenience entry: node scripts/outreach-dry-run.ts
 * Prefer: pnpm sgm-outreach dry-run
 */
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dryRunMod = resolve(root, "packages/ops/dist/dry-run.js");
const { assertDryRunOk, runDryRun } = await import(
  pathToFileURL(dryRunMod).href
);

const dbArgIdx = process.argv.indexOf("--db");
const dbPath =
  dbArgIdx >= 0 && process.argv[dbArgIdx + 1]
    ? resolve(process.argv[dbArgIdx + 1]!)
    : resolve(root, "data", "outreach-dry-run.sqlite");

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
