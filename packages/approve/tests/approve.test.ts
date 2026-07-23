import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ensureLead,
  insertContact,
  insertDraft,
  openAndMigrate,
  setPaused,
  transitionLead,
  upsertCompany,
  type OutreachDb,
} from "@sgm-outreach/core";
import { afterEach, describe, expect, it } from "vitest";
import { applyApprovalAction } from "../src/actions.js";
import { buildDigest } from "../src/digest.js";
import { createApprovalWebhookListener } from "../src/webhook.js";

const dirs: string[] = [];

afterEach(() => {
  while (dirs.length) {
    const d = dirs.pop();
    if (d) rmSync(d, { recursive: true, force: true });
  }
});

function tempDb(): OutreachDb {
  const dir = mkdtempSync(join(tmpdir(), "sgm-approve-"));
  dirs.push(dir);
  return openAndMigrate(join(dir, "t.sqlite"));
}

function seedPending(db: OutreachDb): { draftId: string; leadId: string } {
  const company = upsertCompany(db, {
    name: "Approve Co",
    domain: "approve.example",
    segment: "plugin",
    source: "manual",
  }).company;
  const contact = insertContact(db, {
    company_id: company.id,
    name: "Pat",
    email: "pat@approve.example",
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
  ] as const) {
    transitionLead(db, lead.id, s);
  }
  const draft = insertDraft(db, {
    lead_id: lead.id,
    subject: "Hi",
    body: "Concrete note about your AUv3 ship.",
    model: "fixture",
  });
  return { draftId: draft.id, leadId: lead.id };
}

describe("approve actions", () => {
  it("approve → APPROVED", () => {
    const db = tempDb();
    const { draftId, leadId } = seedPending(db);
    const result = applyApprovalAction(db, {
      action: "approve",
      draft_id: draftId,
    });
    expect(result).toMatchObject({ ok: true, state: "APPROVED", lead_id: leadId });
    const state = db
      .prepare("SELECT state FROM leads WHERE id = ?")
      .get(leadId) as { state: string };
    expect(state.state).toBe("APPROVED");
    db.close();
  });

  it("reject → REJECTED", () => {
    const db = tempDb();
    const { draftId, leadId } = seedPending(db);
    applyApprovalAction(db, {
      action: "reject",
      draft_id: draftId,
      reason: "tone",
    });
    const state = db
      .prepare("SELECT state FROM leads WHERE id = ?")
      .get(leadId) as { state: string };
    expect(state.state).toBe("REJECTED");
    db.close();
  });

  it("edit updates body and re-queues PENDING_APPROVAL", () => {
    const db = tempDb();
    const { draftId } = seedPending(db);
    const result = applyApprovalAction(db, {
      action: "edit",
      draft_id: draftId,
      body: "Edited body with a sharper CTA.",
    });
    expect(result.state).toBe("PENDING_APPROVAL");
    const draft = db
      .prepare("SELECT body FROM drafts WHERE id = ?")
      .get(draftId) as { body: string };
    expect(draft.body).toContain("Edited body");
    db.close();
  });

  it("approve blocked while paused", () => {
    const db = tempDb();
    const { draftId } = seedPending(db);
    setPaused(db, true);
    const result = applyApprovalAction(db, {
      action: "approve",
      draft_id: draftId,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("paused");
    db.close();
  });

  it("digest lists pending drafts", () => {
    const db = tempDb();
    seedPending(db);
    const digest = buildDigest(db);
    expect(digest.count).toBe(1);
    expect(digest.items[0]?.company).toBe("Approve Co");
    db.close();
  });

  it("webhook receiver approves via HTTP", async () => {
    const db = tempDb();
    const { draftId, leadId } = seedPending(db);
    const server = createServer(createApprovalWebhookListener(db));
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("no port");
    const res = await fetch(`http://127.0.0.1:${addr.port}/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "approve", draft_id: draftId }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; state: string };
    expect(body.ok).toBe(true);
    expect(body.state).toBe("APPROVED");
    const state = db
      .prepare("SELECT state FROM leads WHERE id = ?")
      .get(leadId) as { state: string };
    expect(state.state).toBe("APPROVED");
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    db.close();
  });
});
