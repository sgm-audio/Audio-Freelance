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
import {
  createApprovalWebhookListener,
  signApprovalPayload,
} from "../src/webhook.js";

const WEBHOOK_SECRET = "test-secret-with-at-least-32-characters";

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

  it("webhook receiver requires a valid HMAC and rejects replay", async () => {
    const db = tempDb();
    const { draftId, leadId } = seedPending(db);
    const now = 1_800_000_000_000;
    const server = createServer(
      createApprovalWebhookListener(db, { secret: WEBHOOK_SECRET, now: () => now }),
    );
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("no port");
    const url = `http://127.0.0.1:${addr.port}/webhook`;
    const rawBody = JSON.stringify({ action: "approve", draft_id: draftId });
    const timestamp = String(Math.floor(now / 1000));
    const headers = {
      "content-type": "application/json",
      "x-sgm-timestamp": timestamp,
      "x-sgm-signature": signApprovalPayload(WEBHOOK_SECRET, timestamp, rawBody),
    };

    const unsigned = await fetch(url, { method: "POST", body: rawBody });
    expect(unsigned.status).toBe(401);
    const invalid = await fetch(url, {
      method: "POST",
      headers: { ...headers, "x-sgm-signature": "sha256=invalid" },
      body: rawBody,
    });
    expect(invalid.status).toBe(401);

    const res = await fetch(url, { method: "POST", headers, body: rawBody });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; state: string };
    expect(body).toMatchObject({ ok: true, state: "APPROVED" });
    const state = db
      .prepare("SELECT state FROM leads WHERE id = ?")
      .get(leadId) as { state: string };
    expect(state.state).toBe("APPROVED");

    const replay = await fetch(url, { method: "POST", headers, body: rawBody });
    expect(replay.status).toBe(409);
    expect(await replay.json()).toMatchObject({ error: "replayed_request" });

    const staleTimestamp = String(Number(timestamp) - 301);
    const stale = await fetch(url, {
      method: "POST",
      headers: {
        "x-sgm-timestamp": staleTimestamp,
        "x-sgm-signature": signApprovalPayload(WEBHOOK_SECRET, staleTimestamp, rawBody),
      },
      body: rawBody,
    });
    expect(stale.status).toBe(401);

    const oversizedBody = JSON.stringify({ padding: "x".repeat(65 * 1024) });
    const oversized = await fetch(url, {
      method: "POST",
      headers: {
        "x-sgm-timestamp": timestamp,
        "x-sgm-signature": signApprovalPayload(
          WEBHOOK_SECRET,
          timestamp,
          oversizedBody,
        ),
      },
      body: oversizedBody,
    });
    expect(oversized.status).toBe(413);

    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    db.close();
  });

  it("refuses weak webhook secrets", () => {
    const db = tempDb();
    expect(() => createApprovalWebhookListener(db, { secret: "too-short" })).toThrow(
      "at least 32 characters",
    );
    db.close();
  });
});
