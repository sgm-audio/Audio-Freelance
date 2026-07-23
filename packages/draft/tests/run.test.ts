import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SCORE_THRESHOLD,
  ensureLead,
  insertContact,
  insertFact,
  openAndMigrate,
  transitionLead,
  updateLeadScore,
  upsertCompany,
  type OutreachDb,
} from "@sgm-outreach/core";
import { afterEach, describe, expect, it } from "vitest";
import { runDraft } from "../src/run.js";

const dirs: string[] = [];
const claimsPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../config/claims.json",
);

afterEach(() => {
  while (dirs.length) {
    const d = dirs.pop();
    if (d) rmSync(d, { recursive: true, force: true });
  }
});

function tempDb(): OutreachDb {
  const dir = mkdtempSync(join(tmpdir(), "sgm-draft-"));
  dirs.push(dir);
  return openAndMigrate(join(dir, "t.sqlite"));
}

function seedScored(
  db: OutreachDb,
  opts: { score?: number; withFact?: boolean } = {},
): string {
  const company = upsertCompany(db, {
    name: "AUv3 Labs",
    domain: "auv3labs.example",
    segment: "plugin",
    source: "manual",
  }).company;
  const contact = insertContact(db, {
    company_id: company.id,
    name: "Sam Engineer",
    role: "CTO",
    email: "sam@auv3labs.example",
  });
  if (opts.withFact !== false) {
    insertFact(db, {
      company_id: company.id,
      fact: "Shipped AUv3 update last month on the App Store",
      evidence_url: "https://auv3labs.example/blog/auv3",
    });
  }
  const lead = ensureLead(db, {
    company_id: company.id,
    contact_id: contact.id,
    channel: "email",
  }).lead;
  transitionLead(db, lead.id, "ENRICHED");
  transitionLead(db, lead.id, "SCORED");
  updateLeadScore(db, lead.id, opts.score ?? SCORE_THRESHOLD);
  return lead.id;
}

describe("runDraft", () => {
  it("SCORED → DRAFTED → PENDING_APPROVAL with fixture drafter", async () => {
    const db = tempDb();
    const leadId = seedScored(db);
    const result = await runDraft({
      db,
      claimsPath,
      useFixtureDrafter: true,
    });
    expect(result.drafted).toHaveLength(1);
    expect(result.drafted[0]?.lead_id).toBe(leadId);
    const state = db
      .prepare("SELECT state FROM leads WHERE id = ?")
      .get(leadId) as { state: string };
    expect(state.state).toBe("PENDING_APPROVAL");
    const drafts = db
      .prepare("SELECT body FROM drafts WHERE lead_id = ?")
      .all(leadId) as Array<{ body: string }>;
    expect(drafts[0]?.body).toContain("AUv3");
    expect(drafts[0]?.body).toContain("TrackClear");
    db.close();
  });

  it("skips leads below score threshold", async () => {
    const db = tempDb();
    seedScored(db, { score: 40 });
    const result = await runDraft({
      db,
      claimsPath,
      useFixtureDrafter: true,
    });
    expect(result.drafted).toHaveLength(0);
    db.close();
  });

  it("skips when no fact (manual research)", async () => {
    const db = tempDb();
    const leadId = seedScored(db, { withFact: false });
    const result = await runDraft({
      db,
      claimsPath,
      useFixtureDrafter: true,
    });
    expect(result.drafted).toHaveLength(0);
    expect(result.skipped[0]).toMatchObject({
      lead_id: leadId,
      reason: "no_fact_manual_research",
    });
    db.close();
  });

  it("rejects LLM output with fabricated claim", async () => {
    const db = tempDb();
    seedScored(db);
    const result = await runDraft({
      db,
      claimsPath,
      maxRetries: 0,
      llm: {
        kind: "fixture",
        complete: async () => ({
          subject: "Hi",
          body: "I won a Grammy for my industry-leading plugin suite. Call me.",
          fact_used: "Shipped AUv3 update last month on the App Store",
          risk_flags: [],
        }),
      },
    });
    expect(result.drafted).toHaveLength(0);
    expect(result.skipped[0]?.reason).toMatch(/fabricated_claim|validation/);
    db.close();
  });
});
