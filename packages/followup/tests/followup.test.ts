import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ensureLead,
  insertContact,
  insertDraft,
  openAndMigrate,
  transitionLead,
  upsertCompany,
  type OutreachDb,
} from "@sgm-outreach/core";
import { afterEach, describe, expect, it } from "vitest";
import { FOLLOWUP_CADENCE, isDue } from "../src/cadence.js";
import { runFollowup } from "../src/run.js";

const dirs: string[] = [];

afterEach(() => {
  while (dirs.length) {
    const d = dirs.pop();
    if (d) rmSync(d, { recursive: true, force: true });
  }
});

function tempDb(): OutreachDb {
  const dir = mkdtempSync(join(tmpdir(), "sgm-fu-"));
  dirs.push(dir);
  return openAndMigrate(join(dir, "t.sqlite"));
}

function seedSent(db: OutreachDb, updatedAt: string): string {
  const company = upsertCompany(db, {
    name: "FU Co",
    domain: `fu-${updatedAt.slice(0, 10)}.example`.replace(/[^a-z0-9.-]/g, "x"),
    segment: "plugin",
    source: "manual",
  }).company;
  // unique domains per call
  const domain = `fu${Math.random().toString(36).slice(2)}.example`;
  db.prepare("UPDATE companies SET domain = ? WHERE id = ?").run(
    domain,
    company.id,
  );
  const contact = insertContact(db, {
    company_id: company.id,
    name: "Casey",
    email: `casey@${domain}`,
  });
  const lead = ensureLead(db, {
    company_id: company.id,
    contact_id: contact.id,
    channel: "email",
  }).lead;
  for (const s of [
    "ENRICHED",
    "SCORED",
    "DRAFTED",
    "PENDING_APPROVAL",
    "APPROVED",
    "SENT",
  ] as const) {
    transitionLead(db, lead.id, s);
  }
  insertDraft(db, {
    lead_id: lead.id,
    body: "Initial outreach.",
    model: "fixture",
  });
  db.prepare("UPDATE leads SET updated_at = ? WHERE id = ?").run(
    updatedAt,
    lead.id,
  );
  return lead.id;
}

describe("mocked clock cadence", () => {
  it("isDue respects day thresholds", () => {
    const sentAt = "2026-01-01T00:00:00.000Z";
    expect(isDue(sentAt, new Date("2026-01-05T00:00:00.000Z"), 4)).toBe(true);
    expect(isDue(sentAt, new Date("2026-01-04T23:00:00.000Z"), 4)).toBe(false);
    expect(FOLLOWUP_CADENCE.day10).toBe(10);
    expect(FOLLOWUP_CADENCE.day60).toBe(60);
  });

  it("day-4: SENT → NO_REPLY → PENDING_APPROVAL with followup draft", () => {
    const db = tempDb();
    const leadId = seedSent(db, "2026-01-01T12:00:00.000Z");
    const now = new Date("2026-01-06T12:00:00.000Z"); // 5 days later
    const result = runFollowup({ db, now });
    expect(result.marked_no_reply).toContain(leadId);
    expect(result.actions.some((a) => a.lead_id === leadId && a.kind === "day4")).toBe(
      true,
    );
    const state = db
      .prepare("SELECT state FROM leads WHERE id = ?")
      .get(leadId) as { state: string };
    expect(state.state).toBe("PENDING_APPROVAL");
    const draft = db
      .prepare(
        "SELECT model FROM drafts WHERE lead_id = ? ORDER BY created_at DESC LIMIT 1",
      )
      .get(leadId) as { model: string };
    expect(draft.model).toBe("followup-day4");
    db.close();
  });

  it("day-4 dry-run does not mutate", () => {
    const db = tempDb();
    const leadId = seedSent(db, "2026-01-01T12:00:00.000Z");
    const result = runFollowup({
      db,
      now: new Date("2026-01-10T00:00:00.000Z"),
      dryRun: true,
    });
    expect(result.actions[0]?.dry_run).toBe(true);
    const state = db
      .prepare("SELECT state FROM leads WHERE id = ?")
      .get(leadId) as { state: string };
    expect(state.state).toBe("SENT");
    db.close();
  });

  it("day-10 fires from FOLLOWUP_1", () => {
    const db = tempDb();
    const leadId = seedSent(db, "2026-01-01T00:00:00.000Z");
    // Force FOLLOWUP_1 with old updated_at
    db.prepare("UPDATE leads SET state = ?, updated_at = ? WHERE id = ?").run(
      "FOLLOWUP_1",
      "2026-01-01T00:00:00.000Z",
      leadId,
    );
    const result = runFollowup({
      db,
      now: new Date("2026-01-12T00:00:00.000Z"),
    });
    expect(result.actions.some((a) => a.kind === "day10")).toBe(true);
    const draft = db
      .prepare(
        "SELECT model FROM drafts WHERE lead_id = ? ORDER BY rowid DESC LIMIT 1",
      )
      .get(leadId) as { model: string };
    expect(draft.model).toBe("followup-day10");
    db.close();
  });

  it("day-60 fires from FOLLOWUP_2", () => {
    const db = tempDb();
    const leadId = seedSent(db, "2026-01-01T00:00:00.000Z");
    db.prepare("UPDATE leads SET state = ?, updated_at = ? WHERE id = ?").run(
      "FOLLOWUP_2",
      "2026-01-01T00:00:00.000Z",
      leadId,
    );
    const result = runFollowup({
      db,
      now: new Date("2026-03-15T00:00:00.000Z"),
    });
    expect(result.actions.some((a) => a.kind === "day60")).toBe(true);
    const draft = db
      .prepare(
        "SELECT model FROM drafts WHERE lead_id = ? ORDER BY rowid DESC LIMIT 1",
      )
      .get(leadId) as { model: string };
    expect(draft.model).toBe("followup-day60");
    db.close();
  });

  it("does not fire before day-4", () => {
    const db = tempDb();
    seedSent(db, "2026-01-01T00:00:00.000Z");
    const result = runFollowup({
      db,
      now: new Date("2026-01-03T00:00:00.000Z"),
    });
    expect(result.actions).toHaveLength(0);
    db.close();
  });
});
