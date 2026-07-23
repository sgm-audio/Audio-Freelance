import { randomUUID } from "node:crypto";
import {
  LeadStateSchema,
  addSuppression,
  findContactByEmail,
  getLeadById,
  transitionLead,
  type LeadState,
  type OutreachDb,
} from "@sgm-outreach/core";
import { z } from "zod";

/** Simplified internal webhook shapes (tests + local curl). */
export const SimpleWebhookSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("reply"),
    email: z.string().email(),
    lead_id: z.string().uuid().optional(),
  }),
  z.object({
    kind: z.literal("bounce"),
    email: z.string().email(),
    lead_id: z.string().uuid().optional(),
    reason: z.string().optional(),
  }),
]);

/** Resend event envelope (subset — Zod at the boundary). */
export const ResendWebhookSchema = z.object({
  type: z.string().min(1),
  data: z
    .object({
      email_id: z.string().optional(),
      to: z.array(z.string()).optional(),
      from: z.string().optional(),
      bounce: z
        .object({
          message: z.string().optional(),
        })
        .optional(),
    })
    .passthrough(),
});

export type WebhookResult =
  | {
      ok: true;
      action: "reply" | "bounce";
      lead_id: string;
      from_state: LeadState;
      to_state: LeadState;
      email: string;
    }
  | { ok: false; error: string };

const REPLY_CAPABLE = new Set<LeadState>([
  "SENT",
  "NO_REPLY",
  "FOLLOWUP_1",
  "FOLLOWUP_2",
  "NURTURE",
]);

function pickEmailFromResend(type: string, data: {
  to?: string[];
  from?: string;
}): string | null {
  if (type.includes("bounce") || type.includes("failed")) {
    const to = data.to?.[0];
    return to ? to.trim().toLowerCase() : null;
  }
  if (
    type.includes("received") ||
    type.includes("inbound") ||
    type.includes("replied") ||
    type === "email.opened" // never treat open as reply — fall through
  ) {
    // opens are not replies
  }
  if (
    type.includes("received") ||
    type.includes("inbound") ||
    type.includes("reply")
  ) {
    return data.from ? data.from.trim().toLowerCase() : null;
  }
  return null;
}

function classifyResend(type: string): "reply" | "bounce" | null {
  const t = type.toLowerCase();
  if (t.includes("bounce") || t === "email.failed" || t.includes("complained")) {
    return "bounce";
  }
  if (t.includes("received") || t.includes("inbound") || t.includes("reply")) {
    return "reply";
  }
  return null;
}

function findLeadForEmail(
  db: OutreachDb,
  email: string,
  leadId?: string,
): { leadId: string; state: LeadState } | null {
  if (leadId) {
    const lead = getLeadById(db, leadId);
    if (!lead) return null;
    return { leadId: lead.id, state: lead.state };
  }
  const contact = findContactByEmail(db, email);
  if (!contact) return null;
  const row = db
    .prepare(
      `SELECT id, state FROM leads
       WHERE contact_id = ?
       ORDER BY updated_at DESC
       LIMIT 1`,
    )
    .get(contact.id) as { id: string; state: string } | undefined;
  if (!row) return null;
  return { leadId: row.id, state: LeadStateSchema.parse(row.state) };
}

/**
 * Reply → REPLIED → HUMAN instantly (pipeline must not touch HUMAN leads).
 */
export function handleReply(
  db: OutreachDb,
  email: string,
  leadId?: string,
): WebhookResult {
  const found = findLeadForEmail(db, email, leadId);
  if (!found) {
    return { ok: false, error: `No lead found for reply from ${email}` };
  }
  const from = found.state;
  if (from === "HUMAN" || from === "REPLIED") {
    if (from === "REPLIED") {
      transitionLead(db, found.leadId, "HUMAN", {
        source: "webhook.reply",
        email,
      });
      return {
        ok: true,
        action: "reply",
        lead_id: found.leadId,
        from_state: "REPLIED",
        to_state: "HUMAN",
        email,
      };
    }
    return {
      ok: true,
      action: "reply",
      lead_id: found.leadId,
      from_state: "HUMAN",
      to_state: "HUMAN",
      email,
    };
  }
  if (!REPLY_CAPABLE.has(from)) {
    return {
      ok: false,
      error: `Lead ${found.leadId} in ${from} cannot accept reply`,
    };
  }
  transitionLead(db, found.leadId, "REPLIED", {
    source: "webhook.reply",
    email,
  });
  transitionLead(db, found.leadId, "HUMAN", {
    source: "webhook.reply",
    email,
  });
  return {
    ok: true,
    action: "reply",
    lead_id: found.leadId,
    from_state: from,
    to_state: "HUMAN",
    email,
  };
}

/**
 * Bounce → BOUNCED + suppression (fail-closed for future sends).
 */
export function handleBounce(
  db: OutreachDb,
  email: string,
  opts: { leadId?: string; reason?: string } = {},
): WebhookResult {
  const reason = opts.reason ?? "bounce";
  addSuppression(db, email, reason);

  const found = findLeadForEmail(db, email, opts.leadId);
  if (!found) {
    return {
      ok: false,
      error: `Suppressed ${email} but no matching lead`,
    };
  }
  if (found.state === "BOUNCED") {
    return {
      ok: true,
      action: "bounce",
      lead_id: found.leadId,
      from_state: "BOUNCED",
      to_state: "BOUNCED",
      email,
    };
  }
  // Terminal BOUNCED is allowed from most active states via state machine.
  try {
    transitionLead(db, found.leadId, "BOUNCED", {
      source: "webhook.bounce",
      email,
      reason,
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  return {
    ok: true,
    action: "bounce",
    lead_id: found.leadId,
    from_state: found.state,
    to_state: "BOUNCED",
    email,
  };
}

/** Parse unknown JSON body (simple or Resend) and dispatch. */
export function handleWebhookPayload(
  db: OutreachDb,
  raw: unknown,
): WebhookResult {
  const simple = SimpleWebhookSchema.safeParse(raw);
  if (simple.success) {
    if (simple.data.kind === "reply") {
      return simple.data.lead_id
        ? handleReply(db, simple.data.email, simple.data.lead_id)
        : handleReply(db, simple.data.email);
    }
    return handleBounce(db, simple.data.email, {
      ...(simple.data.lead_id ? { leadId: simple.data.lead_id } : {}),
      reason: simple.data.reason ?? "bounce",
    });
  }

  const resend = ResendWebhookSchema.safeParse(raw);
  if (!resend.success) {
    return { ok: false, error: "Unrecognized webhook payload" };
  }
  const action = classifyResend(resend.data.type);
  if (!action) {
    return {
      ok: false,
      error: `Ignored Resend event type: ${resend.data.type}`,
    };
  }
  const email = pickEmailFromResend(resend.data.type, {
    ...(resend.data.data.to ? { to: resend.data.data.to } : {}),
    ...(resend.data.data.from ? { from: resend.data.data.from } : {}),
  });
  if (!email) {
    return { ok: false, error: "Webhook missing email address" };
  }
  if (action === "reply") {
    return handleReply(db, email);
  }
  return handleBounce(db, email, {
    reason: resend.data.data.bounce?.message ?? resend.data.type,
  });
}

/**
 * Minimal HTTP receiver for Resend / local curl.
 * Staging dry-run note: set SGM_OUTREACH_STAGING=1 so send path never hits real inboxes;
 * this webhook still mutates lead state in the configured DB.
 */
export async function serveWebhooks(opts: {
  db: OutreachDb;
  port: number;
  host?: string;
}): Promise<{ close: () => Promise<void> }> {
  const { createServer } = await import("node:http");
  const host = opts.host ?? "127.0.0.1";
  const server = createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, service: "sgm-outreach-webhooks" }));
      return;
    }
    if (req.method !== "POST" || req.url !== "/webhooks/resend") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "not found" }));
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    let body: unknown;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "invalid json" }));
      return;
    }
    const result = handleWebhookPayload(opts.db, body);
    res.writeHead(result.ok ? 200 : 422, {
      "content-type": "application/json",
    });
    res.end(JSON.stringify({ ...result, request_id: randomUUID() }));
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(opts.port, host, () => resolve());
    server.on("error", reject);
  });

  return {
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
