import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { openAndMigrate } from "@sgm-outreach/core";
import { collectMetrics, formatMetricsTable } from "@sgm-outreach/ops";
import { defaultDbPath } from "./status.js";

function flagValue(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i === -1) return undefined;
  return argv[i + 1];
}

export function runMetricsCommand(argv: string[]): void {
  const dbPath = flagValue(argv, "--db") ?? defaultDbPath();
  const daysRaw = flagValue(argv, "--days");
  const segment = flagValue(argv, "--segment");
  const asJson = argv.includes("--json");
  const days = daysRaw ? Number(daysRaw) : 30;

  mkdirSync(dirname(dbPath), { recursive: true });
  const db = openAndMigrate(dbPath);
  try {
    const rows = collectMetrics(db, {
      days,
      ...(segment ? { segment } : {}),
    });
    if (asJson) {
      console.log(
        JSON.stringify({ days, segment: segment ?? null, rows }, null, 2),
      );
    } else {
      console.log(`SGM Outreach metrics (last ${days} day(s))`);
      if (segment) console.log(`segment filter: ${segment}`);
      console.log(formatMetricsTable(rows));
    }
  } finally {
    db.close();
  }
}
