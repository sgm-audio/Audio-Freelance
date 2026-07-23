import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runDryRunCommand } from "../src/dry-run.js";
import { runMetricsCommand } from "../src/metrics.js";

const dirs: string[] = [];

afterEach(() => {
  while (dirs.length) {
    const d = dirs.pop();
    if (d) rmSync(d, { recursive: true, force: true });
  }
});

describe("sgm-outreach dry-run + metrics", () => {
  it("dry-run prints summary and metrics reads events", () => {
    const dir = mkdtempSync(join(tmpdir(), "sgm-cli-m5-"));
    dirs.push(dir);
    const dbPath = join(dir, "dry.sqlite");
    process.env["SGM_OUTREACH_DB"] = dbPath;

    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };
    try {
      runDryRunCommand([
        "node",
        "sgm-outreach",
        "dry-run",
        "--db",
        dbPath,
      ]);
      runMetricsCommand([
        "node",
        "sgm-outreach",
        "metrics",
        "--days",
        "7",
        "--db",
        dbPath,
      ]);
    } finally {
      console.log = orig;
    }

    const text = logs.join("\n");
    expect(text).toContain("sent=9");
    expect(text).toContain("BLOCKED:suppressed");
    expect(text).toContain("SGM Outreach metrics");
    expect(text).toMatch(/sent/i);
  });
});
