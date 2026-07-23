import {
  ensureLead,
  listContactsForCompany,
  listFactsForCompany,
  listLeadsByState,
  openAndMigrate,
  upsertCompany,
} from "@sgm-outreach/core";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  runEnrich,
  type CompanyEnrichFixture,
} from "../src/run.js";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

describe("offline enrichment integration", () => {
  it("enriches ten NEW leads with facts, contacts, and signal metadata", async () => {
    const sites = JSON.parse(
      readFileSync(join(fixtureDir, "company-sites.json"), "utf8"),
    ) as Record<string, CompanyEnrichFixture>;
    const facts = JSON.parse(
      readFileSync(join(fixtureDir, "fixture-facts.json"), "utf8"),
    ) as Record<string, unknown>;
    const directory = mkdtempSync(join(tmpdir(), "sgm-enrich-"));
    const db = openAndMigrate(join(directory, "test.sqlite"));

    try {
      for (const [index, domain] of Object.keys(sites).entries()) {
        const { company } = upsertCompany(db, {
          name: `Fixture Company ${index + 1}`,
          domain,
          source: "fixture",
          segment: "audio",
        });
        ensureLead(db, { company_id: company.id, channel: "email" });
      }

      const result = await runEnrich({
        db,
        limit: 10,
        fixtures: sites,
        fixtureFacts: facts,
      });

      expect(result).toMatchObject({
        selected: 10,
        enriched: 10,
        failed: 0,
        facts_added: 20,
        contacts_added: 10,
      });
      const enriched = listLeadsByState(db, "ENRICHED");
      expect(enriched).toHaveLength(10);
      for (const lead of enriched) {
        expect(listFactsForCompany(db, lead.company_id).length).toBeGreaterThanOrEqual(
          2,
        );
        expect(listContactsForCompany(db, lead.company_id)).toHaveLength(1);
      }

      const event = db
        .prepare("SELECT meta FROM events WHERE to_state = 'ENRICHED' LIMIT 1")
        .get() as { meta: string };
      expect(JSON.parse(event.meta).enrichment.signals.shipping_evidence).toBe(true);
      expect((await runEnrich({ db, fixtures: sites, fixtureFacts: facts })).selected).toBe(
        0,
      );
    } finally {
      db.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
