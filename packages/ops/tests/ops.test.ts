import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ensureLead,
  insertContact,
  openAndMigrate,
  transitionLead,
  upsertCompany,
} from "@sgm-outreach/core";
import { collectMetrics, formatMetricsTable } from "../src/metrics.js";
import { handleBounce, handleReply, handleWebhookPayload } from "../src/webhooks.js";
import { assertDryRunOk, runDryRun } from "../src/dry-run.js";

const dirs: string[] = [];

afterEach(() => {
  while (dirs.length) {
    const d = dirs.pop();
    if (d) rmSync(d, { recursive: true, force: true });
  }
});

function tempDb() {
  const dir = mkdtempSync(join(tmpdir(), "sgm-ops-"));
  dirs.push(dir);
  const path = join(dir, "test.sqlite");
  return { path, db: openAndMigrate(path) };
}

function seedSentLead(
  db: ReturnType<typeof openAndMigrate>,
  opts: { domain: string; segment: string; email: string },
) {
  const { company } = upsertCompany(db, {
    name: opts.domain,
    domain: opts.domain,
    segment: opts.segment,
    source: "test",
  });
  const contact = insertContact(db, {
    company_id: company.id,
    name: "Test",
    email: opts.email,
  });
  const { lead } = ensureLead(db, {
    company_id: company.id,
    contact_id: contact.id,
    channel: "email",
  });
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
  return lead;
}

describe("metrics", () => {
  it("aggregates sent/replies/bounces by day and segment", () => {
    const { db } = tempDb();
    const a = seedSentLead(db, {
      domain: "a.example",
      segment: "music-tech",
      email: "a@a.example",
    });
    const b = seedSentLead(db, {
      domain: "b.example",
      segment: "studio",
      email: "b@b.example",
    });
    transitionLead(db, a.id, "REPLIED");
    transitionLead(db, a.id, "HUMAN");
    transitionLead(db, b.id, "BOUNCED");

    const rows = collectMetrics(db, { days: 7 });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const music = rows.filter((r) => r.segment === "music-tech");
    const studio = rows.filter((r) => r.segment === "studio");
    expect(music.reduce((n, r) => n + r.sent, 0)).toBe(1);
    expect(music.reduce((n, r) => n + r.replies, 0)).toBe(1);
    expect(studio.reduce((n, r) => n + r.bounces, 0)).toBe(1);
    expect(formatMetricsTable(rows)).toContain("music-tech");
    db.close();
  });
});

describe("webhooks", () => {
  it("reply moves SENT → HUMAN via REPLIED", () => {
    const { db } = tempDb();
    seedSentLead(db, {
      domain: "reply.example",
      segment: "music-tech",
      email: "lead@reply.example",
    });
    const result = handleReply(db, "lead@reply.example");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.to_state).toBe("HUMAN");
      expect(result.action).toBe("reply");
    }
    const lead = db
      .prepare("SELECT state FROM leads LIMIT 1")
      .get() as { state: string };
    expect(lead.state).toBe("HUMAN");
    db.close();
  });

  it("bounce sets BOUNCED and suppresses email", () => {
    const { db } = tempDb();
    seedSentLead(db, {
      domain: "bounce.example",
      segment: "music-tech",
      email: "gone@bounce.example",
    });
    const result = handleBounce(db, "gone@bounce.example", {
      reason: "hard-bounce",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.to_state).toBe("BOUNCED");
    const suppressed = db
      .prepare("SELECT reason FROM suppressions WHERE email = ?")
      .get("gone@bounce.example") as { reason: string };
    expect(suppressed.reason).toBe("hard-bounce");
    db.close();
  });

  it("parses Resend bounce shape", () => {
    const { db } = tempDb();
    seedSentLead(db, {
      domain: "rs.example",
      segment: "music-tech",
      email: "x@rs.example",
    });
    const result = handleWebhookPayload(db, {
      type: "email.bounced",
      data: { to: ["x@rs.example"], bounce: { message: "550" } },
    });
    expect(result.ok).toBe(true);
    db.close();
  });
});

describe("dry-run", () => {
  it("sends 9 of 10 and blocks suppressed address", () => {
    const dir = mkdtempSync(join(tmpdir(), "sgm-dry-"));
    dirs.push(dir);
    const path = join(dir, "dry.sqlite");
    const report = runDryRun(path);
    expect(() => assertDryRunOk(report)).not.toThrow();
    expect(report.summary_table).toContain("BLOCKED:suppressed");
    expect(report.sent_count).toBe(9);
  });
});
