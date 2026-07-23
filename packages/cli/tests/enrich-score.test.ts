import {
  ensureLead,
  listFactsForCompany,
  listLeadsByState,
  openAndMigrate,
  upsertCompany,
} from "@sgm-outreach/core";
import {
  runEnrich,
  type CompanyEnrichFixture,
} from "@sgm-outreach/enrich";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runEnrichCommand, runScoreCommand } from "../src/enrich.js";
import { loadStatus } from "../src/status.js";

const dirs: string[] = [];
const enrichFixtureDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "enrich",
  "fixtures",
);

afterEach(() => {
  while (dirs.length) {
    const d = dirs.pop();
    if (d) rmSync(d, { recursive: true, force: true });
  }
});

describe("sgm-outreach enrich + score", () => {
  it("fixture enrich+score yields >=10 SCORED leads with >=2 facts", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sgm-cli-m2-"));
    dirs.push(dir);
    const dbPath = join(dir, "outreach.sqlite");
    process.env["SGM_OUTREACH_DB"] = dbPath;

    const sites = JSON.parse(
      readFileSync(join(enrichFixtureDir, "company-sites.json"), "utf8"),
    ) as Record<string, CompanyEnrichFixture>;
    const facts = JSON.parse(
      readFileSync(join(enrichFixtureDir, "fixture-facts.json"), "utf8"),
    ) as Record<string, unknown>;

    const db = openAndMigrate(dbPath);
    try {
      for (const [index, domain] of Object.keys(sites).entries()) {
        const { company } = upsertCompany(db, {
          name: `Fixture Company ${index + 1}`,
          domain,
          source: "fixture",
          segment: "plugin",
        });
        ensureLead(db, { company_id: company.id, channel: "email" });
      }
      const enrich = await runEnrich({
        db,
        limit: 10,
        fixtures: sites,
        fixtureFacts: facts,
      });
      expect(enrich.enriched).toBe(10);
      expect(listLeadsByState(db, "ENRICHED")).toHaveLength(10);
    } finally {
      db.close();
    }

    runScoreCommand(["node", "sgm-outreach", "score", "--db", dbPath, "--limit", "10"]);

    const status = loadStatus(dbPath);
    expect(status.lead_counts.SCORED).toBeGreaterThanOrEqual(10);

    const check = openAndMigrate(dbPath);
    try {
      const scored = listLeadsByState(check, "SCORED");
      expect(scored.length).toBeGreaterThanOrEqual(10);
      let withTwo = 0;
      for (const lead of scored) {
        if (listFactsForCompany(check, lead.company_id).length >= 2) withTwo += 1;
      }
      expect(withTwo).toBeGreaterThanOrEqual(10);
    } finally {
      check.close();
    }
  });

  it("enrich without fixtures or live exits with clear message", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sgm-cli-m2-"));
    dirs.push(dir);
    const dbPath = join(dir, "outreach.sqlite");
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit:${code ?? 0}`);
    }) as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(
        runEnrichCommand(["node", "sgm-outreach", "enrich", "--db", dbPath]),
      ).rejects.toThrow(/exit:1/);
      expect(errSpy.mock.calls.flat().join("\n")).toMatch(/DEEPSEEK_API_KEY|Ollama|fixtures/i);
    } finally {
      exitSpy.mockRestore();
      errSpy.mockRestore();
    }
  });
});
