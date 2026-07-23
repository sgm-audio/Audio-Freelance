import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openAndMigrate } from "../src/db.js";
import {
  addSuppression,
  ensureLead,
  findCompanyByDomain,
  getPipelineStatus,
  isEmailSuppressed,
  normalizeDomain,
  setPaused,
  transitionLead,
  upsertCompany,
} from "../src/repo.js";
import {
  IllegalTransitionError,
  assertTransition,
  canTransition,
} from "../src/state-machine.js";

const dirs: string[] = [];

afterEach(() => {
  while (dirs.length) {
    const d = dirs.pop();
    if (d) rmSync(d, { recursive: true, force: true });
  }
});

function tempDb(): { path: string; db: ReturnType<typeof openAndMigrate> } {
  const dir = mkdtempSync(join(tmpdir(), "sgm-outreach-"));
  dirs.push(dir);
  const path = join(dir, "test.sqlite");
  return { path, db: openAndMigrate(path) };
}

describe("state machine", () => {
  it("allows NEW → ENRICHED → SCORED", () => {
    expect(canTransition(null, "NEW")).toBe(true);
    expect(canTransition("NEW", "ENRICHED")).toBe(true);
    expect(canTransition("ENRICHED", "SCORED")).toBe(true);
  });

  it("rejects illegal jumps", () => {
    expect(canTransition("NEW", "SENT")).toBe(false);
    expect(() => assertTransition("NEW", "SENT")).toThrow(IllegalTransitionError);
  });

  it("allows terminal escapes from NEW", () => {
    expect(canTransition("NEW", "UNSUBSCRIBED")).toBe(true);
    expect(canTransition("NEW", "REJECTED")).toBe(true);
  });
});

describe("sqlite migrations + status", () => {
  it("migrates empty db and reports zero pipeline", () => {
    const { path, db } = tempDb();
    const status = getPipelineStatus(db, path);
    expect(status.paused).toBe(false);
    expect(status.totals.leads).toBe(0);
    expect(status.totals.companies).toBe(0);
    expect(status.lead_counts.NEW).toBe(0);
    expect(status.lead_counts.SENT).toBe(0);
    db.close();
  });

  it("pause kill switch persists", () => {
    const { path, db } = tempDb();
    setPaused(db, true);
    expect(getPipelineStatus(db, path).paused).toBe(true);
    setPaused(db, false);
    expect(getPipelineStatus(db, path).paused).toBe(false);
    db.close();
  });

  it("suppression lookup is case-insensitive", () => {
    const { db } = tempDb();
    db.prepare(
      "INSERT INTO suppressions (email, reason, at) VALUES (?, ?, ?)",
    ).run("out@example.com", "unsubscribe", new Date().toISOString());
    expect(isEmailSuppressed(db, "OUT@example.com")).toBe(true);
    expect(isEmailSuppressed(db, "other@example.com")).toBe(false);
    db.close();
  });

  it("addSuppression upserts and normalizes email", () => {
    const { db } = tempDb();
    addSuppression(db, "  Bounce@Example.com ", "bounce");
    expect(isEmailSuppressed(db, "bounce@example.com")).toBe(true);
    addSuppression(db, "bounce@example.com", "hard-bounce");
    const row = db
      .prepare("SELECT reason FROM suppressions WHERE email = ?")
      .get("bounce@example.com") as { reason: string };
    expect(row.reason).toBe("hard-bounce");
    db.close();
  });

  it("transitionLead appends event and updates state", () => {
    const { db } = tempDb();
    const companyId = "11111111-1111-1111-1111-111111111111";
    const leadId = "22222222-2222-2222-2222-222222222222";
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO companies (id, name, domain, tier, segment, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(companyId, "Acme Audio", "acme.example", 1, "plugin", "manual", now);
    db.prepare(
      `INSERT INTO leads (id, company_id, contact_id, channel, state, score, updated_at)
       VALUES (?, ?, NULL, ?, ?, ?, ?)`,
    ).run(leadId, companyId, "email", "NEW", 0, now);

    transitionLead(db, leadId, "ENRICHED", { note: "test" });
    const lead = db.prepare("SELECT state FROM leads WHERE id = ?").get(leadId) as {
      state: string;
    };
    expect(lead.state).toBe("ENRICHED");
    const events = db
      .prepare("SELECT from_state, to_state, meta FROM events WHERE lead_id = ?")
      .all(leadId) as Array<{ from_state: string; to_state: string; meta: string }>;
    expect(events).toHaveLength(1);
    expect(events[0]?.from_state).toBe("NEW");
    expect(events[0]?.to_state).toBe("ENRICHED");
    expect(JSON.parse(events[0]!.meta)).toEqual({ note: "test" });
    db.close();
  });

  it("upsertCompany dedupes by domain and ensureLead is idempotent", () => {
    const { db } = tempDb();
    expect(normalizeDomain("https://WWW.Acme.Example/path")).toBe("acme.example");

    const a = upsertCompany(db, {
      name: "Acme",
      domain: "https://www.acme.example/",
      source: "manual",
      segment: "plugin",
    });
    expect(a.created).toBe(true);
    const b = upsertCompany(db, {
      name: "Acme Audio",
      domain: "acme.example",
      source: "appstore-auv3",
    });
    expect(b.created).toBe(false);
    expect(b.company.id).toBe(a.company.id);
    expect(findCompanyByDomain(db, "ACME.EXAMPLE")?.id).toBe(a.company.id);

    const l1 = ensureLead(db, { company_id: a.company.id, channel: "email" });
    const l2 = ensureLead(db, { company_id: a.company.id, channel: "email" });
    expect(l1.created).toBe(true);
    expect(l2.created).toBe(false);
    expect(l2.lead.id).toBe(l1.lead.id);
    db.close();
  });
});
