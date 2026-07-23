import { openAndMigrate } from "@sgm-outreach/core";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { addCompany } from "../src/add-company.js";
import { runIngest } from "../src/run.js";
import { writeCandidates } from "../src/write.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
const dirs: string[] = [];

afterEach(() => {
  while (dirs.length) {
    const d = dirs.pop();
    if (d) rmSync(d, { recursive: true, force: true });
  }
});

function tempDb() {
  const dir = mkdtempSync(join(tmpdir(), "sgm-ingest-"));
  dirs.push(dir);
  const path = join(dir, "test.sqlite");
  return { path, db: openAndMigrate(path) };
}

describe("dedupe + add-company", () => {
  it("dedupes domain across sources when writing", () => {
    const { db } = tempDb();
    const first = writeCandidates(db, [
      {
        name: "Waveform Labs",
        domain: "https://www.waveformlabs.dev",
        source: "salesnav-csv",
        segment: "music-tech",
        channel: "linkedin",
      },
    ]);
    expect(first.companies_created).toBe(1);

    const second = writeCandidates(db, [
      {
        name: "Waveform Labs Inc",
        domain: "waveformlabs.dev",
        source: "appstore-auv3",
        segment: "ios-audio",
        channel: "email",
      },
    ]);
    expect(second.companies_created).toBe(0);
    expect(second.companies_deduped).toBe(1);
    expect(second.leads_created).toBe(1); // new channel

    const n = db.prepare("SELECT COUNT(*) AS n FROM companies").get() as {
      n: number;
    };
    expect(n.n).toBe(1);
    db.close();
  });

  it("addCompany is idempotent by domain", () => {
    const { db } = tempDb();
    const a = addCompany(db, {
      name: "SGM Studios",
      domain: "sgmstudios.ca",
      segment: "ios-audio",
    });
    expect(a.created).toBe(true);
    expect(a.lead_created).toBe(true);
    const b = addCompany(db, {
      name: "SGM Studios Dup",
      domain: "https://sgmstudios.ca/",
    });
    expect(b.created).toBe(false);
    expect(b.company_id).toBe(a.company_id);
    expect(b.lead_created).toBe(false);
    db.close();
  });

  it("runIngest with fixtures loads multiple sources", async () => {
    const { db } = tempDb();
    try {
      const result = await runIngest({
        db,
        sources: ["appstore-auv3", "salesnav-csv", "upwork-rss", "jobboards"],
        fixtures: {
          appstoreJson: JSON.parse(
            readFileSync(join(fixtures, "appstore-sample.json"), "utf8"),
          ),
          salesnavCsv: readFileSync(join(fixtures, "salesnav-sample.csv"), "utf8"),
          upworkXml: readFileSync(join(fixtures, "upwork-sample.xml"), "utf8"),
          soundlisterHtml: readFileSync(
            join(fixtures, "soundlister-jobs.html"),
            "utf8",
          ),
          tapHtml: readFileSync(join(fixtures, "tap-jobs.html"), "utf8"),
        },
      });

      expect(result.by_source["appstore-auv3"]?.candidates).toBe(2);
      expect(result.by_source["salesnav-csv"]?.candidates).toBe(3);
      expect(result.by_source["upwork-rss"]?.candidates).toBe(2);
      expect(result.by_source["jobboards"]?.candidates).toBe(3);
      expect(result.totals.companies_created).toBeGreaterThanOrEqual(9);

      const companies = db
        .prepare("SELECT domain FROM companies ORDER BY domain")
        .all() as Array<{ domain: string }>;
      expect(companies.length).toBe(result.totals.companies_created);
    } finally {
      db.close();
    }
  });
});
