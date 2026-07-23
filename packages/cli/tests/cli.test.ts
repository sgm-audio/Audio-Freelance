import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { runAddCompanyCommand, runIngestCommand } from "../src/ingest.js";
import { formatStatus, loadStatus, pauseSends } from "../src/status.js";

const dirs: string[] = [];
const fixtureDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "ingest",
  "fixtures",
);

afterEach(() => {
  while (dirs.length) {
    const d = dirs.pop();
    if (d) rmSync(d, { recursive: true, force: true });
  }
});

describe("sgm-outreach status", () => {
  it("prints empty pipeline for fresh db", () => {
    const dir = mkdtempSync(join(tmpdir(), "sgm-cli-"));
    dirs.push(dir);
    const dbPath = join(dir, "outreach.sqlite");
    process.env["SGM_OUTREACH_DB"] = dbPath;
    const text = formatStatus(loadStatus(dbPath));
    expect(text).toContain("SGM Outreach Engine");
    expect(text).toContain("leads:         0");
    expect(text).toContain("(empty)");
    expect(text).toContain("paused: no");
  });

  it("pause updates status", () => {
    const dir = mkdtempSync(join(tmpdir(), "sgm-cli-"));
    dirs.push(dir);
    const dbPath = join(dir, "outreach.sqlite");
    process.env["SGM_OUTREACH_DB"] = dbPath;
    pauseSends(dbPath);
    expect(loadStatus(dbPath).paused).toBe(true);
  });
});

describe("sgm-outreach ingest + add-company", () => {
  it("add-company then status shows company", () => {
    const dir = mkdtempSync(join(tmpdir(), "sgm-cli-"));
    dirs.push(dir);
    const dbPath = join(dir, "outreach.sqlite");
    process.env["SGM_OUTREACH_DB"] = dbPath;
    runAddCompanyCommand([
      "node",
      "sgm-outreach",
      "add-company",
      "--name",
      "Test Audio Co",
      "--domain",
      "testaudio.example",
      "--db",
      dbPath,
    ]);
    const status = loadStatus(dbPath);
    expect(status.totals.companies).toBe(1);
    expect(status.totals.leads).toBe(1);
    expect(status.lead_counts.NEW).toBe(1);
  });

  it("ingest --fixtures loads companies", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sgm-cli-"));
    dirs.push(dir);
    const dbPath = join(dir, "outreach.sqlite");
    process.env["SGM_OUTREACH_DB"] = dbPath;
    await runIngestCommand([
      "node",
      "sgm-outreach",
      "ingest",
      "--fixtures",
      fixtureDir,
      "--db",
      dbPath,
    ]);
    const status = loadStatus(dbPath);
    expect(status.totals.companies).toBeGreaterThanOrEqual(9);
    expect(status.lead_counts.NEW).toBeGreaterThanOrEqual(9);
  });
});
