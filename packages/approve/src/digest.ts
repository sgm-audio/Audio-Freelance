import {
  getCompanyById,
  getContactById,
  getDraftById,
  getLatestDraftForLead,
  getLeadById,
  listLeadsByState,
  type OutreachDb,
} from "@sgm-outreach/core";
import { z } from "zod";

export const DigestItemSchema = z.object({
  draft_id: z.string().uuid(),
  lead_id: z.string().uuid(),
  channel: z.enum(["email", "linkedin", "upwork"]),
  company: z.string(),
  contact: z.string().nullable(),
  subject: z.string().nullable(),
  body: z.string(),
  score: z.number().int(),
});

export const DigestPayloadSchema = z.object({
  generated_at: z.string().datetime(),
  count: z.number().int().nonnegative(),
  items: z.array(DigestItemSchema),
});

export type DigestPayload = z.infer<typeof DigestPayloadSchema>;

/** Build digest of PENDING_APPROVAL drafts for n8n / Telegram / CLI. */
export function buildDigest(db: OutreachDb): DigestPayload {
  const leads = listLeadsByState(db, "PENDING_APPROVAL");
  const items = [];
  for (const lead of leads) {
    const draft = getLatestDraftForLead(db, lead.id);
    if (!draft) continue;
    // Prefer getDraftById path is same row
    getDraftById(db, draft.id);
    const company = getCompanyById(db, lead.company_id);
    const contact = lead.contact_id
      ? getContactById(db, lead.contact_id)
      : null;
    items.push({
      draft_id: draft.id,
      lead_id: lead.id,
      channel: lead.channel,
      company: company?.name ?? "(unknown)",
      contact: contact?.name ?? null,
      subject: draft.subject,
      body: draft.body,
      score: lead.score,
    });
  }
  return DigestPayloadSchema.parse({
    generated_at: new Date().toISOString(),
    count: items.length,
    items,
  });
}

export function formatDigestText(digest: DigestPayload): string {
  const lines = [
    `SGM Outreach — approval digest (${digest.count})`,
    `at: ${digest.generated_at}`,
    "",
  ];
  for (const item of digest.items) {
    lines.push(`---`);
    lines.push(`draft: ${item.draft_id}`);
    lines.push(`lead:  ${item.lead_id} [${item.channel}] score=${item.score}`);
    lines.push(`co:    ${item.company}`);
    if (item.contact) lines.push(`to:    ${item.contact}`);
    if (item.subject) lines.push(`subj:  ${item.subject}`);
    lines.push(item.body);
    lines.push(`actions: approve ${item.draft_id} | reject ${item.draft_id} | edit`);
    lines.push("");
  }
  if (digest.count === 0) lines.push("(empty)");
  return lines.join("\n");
}

/** Optional POST to N8N_APPROVAL_WEBHOOK_URL — no-op if unset. */
export async function pushDigestWebhook(
  digest: DigestPayload,
  webhookUrl?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ pushed: boolean; status?: number }> {
  const url = webhookUrl ?? process.env["N8N_APPROVAL_WEBHOOK_URL"]?.trim();
  if (!url) return { pushed: false };
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(digest),
  });
  return { pushed: true, status: res.status };
}

export function getLeadForDraft(db: OutreachDb, draftId: string) {
  const draft = getDraftById(db, draftId);
  if (!draft) return null;
  const lead = getLeadById(db, draft.lead_id);
  if (!lead) return null;
  return { draft, lead };
}
