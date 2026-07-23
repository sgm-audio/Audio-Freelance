import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ensureLead,
  insertContact,
  insertDraft,
  isEmailSuppressed,
  openAndMigrate,
  setPaused,
  transitionLead,
  upsertCompany,
  type OutreachDb,
} from "@sgm-outreach/core";
import { afterEach, describe, expect, it } from "vitest";
import { signUnsubToken, verifyUnsubToken } from "../src/casl.js";
import { loadSendConfig, type SendConfig } from "../src/config.js";
import { sendApprovedEmails } from "../src/email.js";
import type { ResendTransport } from "../src/resend.js";
import { createUnsubscribeRequestListener } from "../src/unsubscribe.js";

const dirs: string[] = [];

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function tempDb(): OutreachDb {
  const dir = mkdtempSync(join(tmpdir(), "sgm-send-"));
  dirs.push(dir);
  return openAndMigrate(join(dir, "test.sqlite"));
}

function testConfig(overrides: Partial<SendConfig> = {}): SendConfig {
  return loadSendConfig({
    resendApiKey: "re_test_key_xxxxxxxx",
    unsubSecret: "test-unsub-secret-key",
    staging: false,
    unsubscribeBaseUrl: "http://127.0.0.1:8791/unsubscribe",
    ...overrides,
  });
}

function mockTransport(): ResendTransport & {
  calls: Array<{ to: string[]; subject: string; text: string; from: string }>;
} {
  const calls: Array<{
    to: string[];
    subject: string;
    text: string;
    from: string;
  }> = [];
  return {
    calls,
    async send(payload) {
      calls.push({
        from: payload.from,
        to: payload.to,
        subject: payload.subject,
        text: payload.text,
      });
      return { id: `mock_${calls.length}` };
    },
  };
}

async function seedApprovedEmailLead(
  db: OutreachDb,
  email: string,
): Promise<{ leadId: string }> {
  const company = upsertCompany(db, {
    name: "Plugin Co",
    domain: "plugin.example",
    segment: "plugin",
    source: "manual",
  }).company;
  const contact = insertContact(db, {
    company_id: company.id,
    name: "Ada Engineer",
    role: "CTO",
    email,
  });
  const lead = ensureLead(db, {
    company_id: company.id,
    contact_id: contact.id,
    channel: "email",
  }).lead;
  transitionLead(db, lead.id, "ENRICHED");
  transitionLead(db, lead.id, "SCORED");
  transitionLead(db, lead.id, "DRAFTED");
  transitionLead(db, lead.id, "PENDING_APPROVAL");
  transitionLead(db, lead.id, "APPROVED");
  insertDraft(db, {
    lead_id: lead.id,
    subject: "DSP help?",
    body: "Saw your AUv3 update — I build real-time engines.",
    model: "fixture",
  });
  return { leadId: lead.id };
}

describe("sendApprovedEmails", () => {
  it("sends via mocked Resend, appends CASL footer, transitions to SENT", async () => {
    const db = tempDb();
    const { leadId } = await seedApprovedEmailLead(db, "ada@plugin.example");
    const transport = mockTransport();
    const config = testConfig();

    const result = await sendApprovedEmails({ db, config, transport });

    expect(result.paused).toBe(false);
    expect(result.sent).toHaveLength(1);
    expect(result.sent[0]).toMatchObject({
      ok: true,
      lead_id: leadId,
      to: "ada@plugin.example",
      staging: false,
    });
    expect(transport.calls).toHaveLength(1);
    const call = transport.calls[0]!;
    expect(call.to).toEqual(["ada@plugin.example"]);
    expect(call.text).toContain("Saw your AUv3 update");
    expect(call.text).toContain("Scott");
    expect(call.text).toContain("SGM Studios");
    expect(call.text).toContain("scott@sgmstudios.ca");
    expect(call.text).toContain("Unsubscribe:");
    expect(call.text).toMatch(/token=/);

    const state = db
      .prepare("SELECT state FROM leads WHERE id = ?")
      .get(leadId) as { state: string };
    expect(state.state).toBe("SENT");
    db.close();
  });

  it("blocks suppressed addresses before Resend (fail closed)", async () => {
    const db = tempDb();
    await seedApprovedEmailLead(db, "blocked@plugin.example");
    db.prepare(
      "INSERT INTO suppressions (email, reason, at) VALUES (?, ?, ?)",
    ).run("blocked@plugin.example", "unsubscribe", new Date().toISOString());

    const transport = mockTransport();
    const result = await sendApprovedEmails({
      db,
      config: testConfig(),
      transport,
    });

    expect(result.sent).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.reason).toBe("suppressed");
    expect(transport.calls).toHaveLength(0);
    db.close();
  });

  it("respects settings.paused kill switch", async () => {
    const db = tempDb();
    await seedApprovedEmailLead(db, "ada@plugin.example");
    setPaused(db, true);
    const transport = mockTransport();

    const result = await sendApprovedEmails({
      db,
      config: testConfig(),
      transport,
    });

    expect(result.paused).toBe(true);
    expect(result.sent).toHaveLength(0);
    expect(transport.calls).toHaveLength(0);
    db.close();
  });

  it("staging mode redirects delivery to sink address", async () => {
    const db = tempDb();
    await seedApprovedEmailLead(db, "ada@plugin.example");
    const transport = mockTransport();
    const config = testConfig({
      staging: true,
      sinkEmail: "sink@sgmstudios.ca",
    });

    const result = await sendApprovedEmails({ db, config, transport });

    expect(result.sent).toHaveLength(1);
    expect(result.sent[0]).toMatchObject({
      ok: true,
      to: "sink@sgmstudios.ca",
      intended_to: "ada@plugin.example",
      staging: true,
    });
    expect(transport.calls[0]?.to).toEqual(["sink@sgmstudios.ca"]);
    db.close();
  });

  it("does not send LinkedIn-channel APPROVED leads", async () => {
    const db = tempDb();
    const company = upsertCompany(db, {
      name: "LI Co",
      domain: "li.example",
      segment: "plugin",
      source: "manual",
    }).company;
    const contact = insertContact(db, {
      company_id: company.id,
      name: "Lin",
      linkedin_url: "https://linkedin.com/in/lin",
    });
    const lead = ensureLead(db, {
      company_id: company.id,
      contact_id: contact.id,
      channel: "linkedin",
    }).lead;
    for (const s of [
      "ENRICHED",
      "SCORED",
      "DRAFTED",
      "PENDING_APPROVAL",
      "APPROVED",
    ] as const) {
      transitionLead(db, lead.id, s);
    }
    const transport = mockTransport();
    const result = await sendApprovedEmails({
      db,
      config: testConfig(),
      transport,
    });
    expect(result.sent).toHaveLength(0);
    expect(transport.calls).toHaveLength(0);
    db.close();
  });
});

describe("unsubscribe HTTP endpoint", () => {
  it("writes suppression + UNSUBSCRIBED transition", async () => {
    const db = tempDb();
    const { leadId } = await seedApprovedEmailLead(db, "ada@plugin.example");
    // Move to SENT so post-send unsub is realistic.
    transitionLead(db, leadId, "SENT");
    const config = testConfig();
    const token = signUnsubToken(
      { email: "ada@plugin.example", lead_id: leadId },
      config.unsubSecret,
    );

    const listener = createUnsubscribeRequestListener(db, config.unsubSecret);
    const server = createServer(listener);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("no port");
    const res = await fetch(
      `http://127.0.0.1:${addr.port}/unsubscribe?token=${encodeURIComponent(token)}`,
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("unsubscribed");

    expect(isEmailSuppressed(db, "ada@plugin.example")).toBe(true);
    const state = db
      .prepare("SELECT state FROM leads WHERE id = ?")
      .get(leadId) as { state: string };
    expect(state.state).toBe("UNSUBSCRIBED");

    // Token verifies
    expect(verifyUnsubToken(token, config.unsubSecret)?.email).toBe(
      "ada@plugin.example",
    );

    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    db.close();
  });

  it("rejects forged tokens", async () => {
    const db = tempDb();
    const listener = createUnsubscribeRequestListener(db, "test-unsub-secret-key");
    const server = createServer(listener);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("no port");
    const res = await fetch(
      `http://127.0.0.1:${addr.port}/unsubscribe?token=forged.bad`,
    );
    expect(res.status).toBe(400);
    expect(isEmailSuppressed(db, "anyone@example.com")).toBe(false);
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    db.close();
  });
});

describe("loadSendConfig", () => {
  it("requires sink email when staging is on", () => {
    expect(() =>
      loadSendConfig({
        unsubSecret: "test-unsub-secret-key",
        staging: true,
      }),
    ).toThrow(/sinkEmail/);
  });
});
