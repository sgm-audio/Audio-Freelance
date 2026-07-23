import {
  getContactById,
  getLatestDraftForLead,
  isEmailSuppressed,
  isPaused,
  listLeadsByState,
  transitionLead,
  type Lead,
  type OutreachDb,
} from "@sgm-outreach/core";
import { z } from "zod";
import { appendCaslFooter, buildUnsubscribeUrl } from "./casl.js";
import type { SendConfig } from "./config.js";
import {
  createResendTransport,
  type ResendTransport,
} from "./resend.js";

export const SendOneResultSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    lead_id: z.string().uuid(),
    resend_id: z.string(),
    to: z.string().email(),
    intended_to: z.string().email(),
    staging: z.boolean(),
  }),
  z.object({
    ok: z.literal(false),
    lead_id: z.string().uuid(),
    reason: z.string().min(1),
  }),
]);

export type SendOneResult = z.infer<typeof SendOneResultSchema>;

export interface SendApprovedOptions {
  db: OutreachDb;
  config: SendConfig;
  /** Injected for tests; defaults to real Resend transport when api key present. */
  transport?: ResendTransport;
  limit?: number;
}

export interface SendApprovedResult {
  sent: SendOneResult[];
  skipped: SendOneResult[];
  paused: boolean;
}

function resolveRecipient(
  intended: string,
  config: SendConfig,
): { to: string; staging: boolean } {
  if (config.staging) {
    const sink = config.sinkEmail;
    if (!sink) {
      throw new Error("staging mode requires sinkEmail");
    }
    return { to: sink, staging: true };
  }
  return { to: intended, staging: false };
}

/**
 * Send one APPROVED email lead via Resend.
 * Suppression is checked against the *intended* contact email (fail closed)
 * before staging redirect. CASL footer appended here, not by the LLM.
 */
export async function sendApprovedLead(
  db: OutreachDb,
  lead: Lead,
  config: SendConfig,
  transport: ResendTransport,
): Promise<SendOneResult> {
  if (lead.channel !== "email") {
    return {
      ok: false,
      lead_id: lead.id,
      reason: "not_email_channel",
    };
  }
  if (lead.state !== "APPROVED") {
    return {
      ok: false,
      lead_id: lead.id,
      reason: `not_approved:${lead.state}`,
    };
  }
  if (!lead.contact_id) {
    return { ok: false, lead_id: lead.id, reason: "missing_contact" };
  }

  const contact = getContactById(db, lead.contact_id);
  if (!contact?.email) {
    return { ok: false, lead_id: lead.id, reason: "missing_email" };
  }
  const intended = contact.email.trim().toLowerCase();

  // Fail closed: any suppression hit (or empty email) blocks send.
  let suppressed: boolean;
  try {
    suppressed = isEmailSuppressed(db, intended);
  } catch (err) {
    return {
      ok: false,
      lead_id: lead.id,
      reason: `suppression_check_failed:${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (suppressed) {
    return { ok: false, lead_id: lead.id, reason: "suppressed" };
  }

  const draft = getLatestDraftForLead(db, lead.id);
  if (!draft) {
    return { ok: false, lead_id: lead.id, reason: "missing_draft" };
  }

  const unsubUrl = buildUnsubscribeUrl(config, {
    email: intended,
    lead_id: lead.id,
  });
  const text = appendCaslFooter(draft.body, config, unsubUrl);
  const subject =
    draft.subject?.trim() ||
    `Quick note from ${config.businessName}`;

  const { to, staging } = resolveRecipient(intended, config);

  const result = await transport.send({
    from: `${config.fromName} <${config.fromEmail}>`,
    to: [to],
    subject,
    text,
  });

  // Followup drafts land in FOLLOWUP_*/NURTURE; initial outreach → SENT.
  const nextState =
    draft.model === "followup-day4"
      ? ("FOLLOWUP_1" as const)
      : draft.model === "followup-day10"
        ? ("FOLLOWUP_2" as const)
        : draft.model === "followup-day60"
          ? ("NURTURE" as const)
          : ("SENT" as const);

  transitionLead(db, lead.id, nextState, {
    resend_id: result.id,
    to,
    intended_to: intended,
    staging,
    subject,
    draft_model: draft.model,
  });

  return {
    ok: true,
    lead_id: lead.id,
    resend_id: result.id,
    to,
    intended_to: intended,
    staging,
  };
}

/**
 * Drain APPROVED email leads (email channel only).
 * Respects settings.paused kill switch globally.
 */
export async function sendApprovedEmails(
  options: SendApprovedOptions,
): Promise<SendApprovedResult> {
  const { db, config } = options;
  if (isPaused(db)) {
    return { sent: [], skipped: [], paused: true };
  }

  const transport =
    options.transport ??
    (() => {
      if (!config.resendApiKey) {
        throw new Error(
          "RESEND_API_KEY missing — set it or inject a ResendTransport for tests",
        );
      }
      return createResendTransport(config.resendApiKey);
    })();

  const leads = listLeadsByState(db, "APPROVED", options.limit ?? 50).filter(
    (l) => l.channel === "email",
  );

  const sent: SendOneResult[] = [];
  const skipped: SendOneResult[] = [];

  for (const lead of leads) {
    // Re-check pause between sends (kill switch mid-batch).
    if (isPaused(db)) {
      skipped.push({
        ok: false,
        lead_id: lead.id,
        reason: "paused",
      });
      continue;
    }
    const result = await sendApprovedLead(db, lead, config, transport);
    if (result.ok) sent.push(result);
    else skipped.push(result);
  }

  return { sent, skipped, paused: false };
}
