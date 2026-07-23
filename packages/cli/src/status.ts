import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  getPipelineStatus,
  openAndMigrate,
  setPaused,
  type PipelineStatus,
} from "@sgm-outreach/core";

export function defaultDbPath(): string {
  if (process.env["SGM_OUTREACH_DB"]) {
    return resolve(process.env["SGM_OUTREACH_DB"]);
  }
  return resolve(process.cwd(), "data", "outreach.sqlite");
}

export function loadStatus(dbPath = defaultDbPath()): PipelineStatus {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = openAndMigrate(dbPath);
  try {
    return getPipelineStatus(db, dbPath);
  } finally {
    db.close();
  }
}

export function formatStatus(status: PipelineStatus): string {
  const lines = [
    "SGM Outreach Engine — pipeline status",
    `db: ${status.db_path}`,
    `paused: ${status.paused ? "YES" : "no"}`,
    "",
    "totals:",
    `  companies:     ${status.totals.companies}`,
    `  contacts:      ${status.totals.contacts}`,
    `  leads:         ${status.totals.leads}`,
    `  drafts:        ${status.totals.drafts}`,
    `  events:        ${status.totals.events}`,
    `  suppressions:  ${status.totals.suppressions}`,
    "",
    "leads by state:",
  ];
  const states = Object.keys(status.lead_counts).sort();
  let any = false;
  for (const state of states) {
    const n = status.lead_counts[state as keyof typeof status.lead_counts];
    if (n > 0) {
      lines.push(`  ${state}: ${n}`);
      any = true;
    }
  }
  if (!any) lines.push("  (empty)");
  return lines.join("\n");
}

export function pauseSends(dbPath = defaultDbPath()): void {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = openAndMigrate(dbPath);
  try {
    setPaused(db, true);
  } finally {
    db.close();
  }
}

export function resumeSends(dbPath = defaultDbPath()): void {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = openAndMigrate(dbPath);
  try {
    setPaused(db, false);
  } finally {
    db.close();
  }
}
