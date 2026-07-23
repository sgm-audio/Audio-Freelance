import {
  getDraftById,
  getLeadById,
  isPaused,
  transitionLead,
  updateDraft,
  type OutreachDb,
} from "@sgm-outreach/core";
import { z } from "zod";

export const ApprovalActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"),
    draft_id: z.string().uuid(),
  }),
  z.object({
    action: z.literal("reject"),
    draft_id: z.string().uuid(),
    reason: z.string().min(1).default("rejected"),
  }),
  z.object({
    action: z.literal("edit"),
    draft_id: z.string().uuid(),
    body: z.string().min(1),
    subject: z.string().nullable().optional(),
  }),
]);

export type ApprovalAction = z.infer<typeof ApprovalActionSchema>;

export interface ActionResult {
  ok: boolean;
  draft_id: string;
  lead_id?: string;
  state?: string;
  error?: string;
}

/**
 * Apply approve | reject | edit.
 * Approve respects pause kill switch (does not advance to APPROVED while paused).
 */
export function applyApprovalAction(
  db: OutreachDb,
  raw: unknown,
): ActionResult {
  const action = ApprovalActionSchema.parse(raw);
  const draft = getDraftById(db, action.draft_id);
  if (!draft) {
    return { ok: false, draft_id: action.draft_id, error: "draft_not_found" };
  }
  const lead = getLeadById(db, draft.lead_id);
  if (!lead) {
    return { ok: false, draft_id: action.draft_id, error: "lead_not_found" };
  }
  if (lead.state !== "PENDING_APPROVAL") {
    return {
      ok: false,
      draft_id: action.draft_id,
      lead_id: lead.id,
      state: lead.state,
      error: `not_pending:${lead.state}`,
    };
  }

  if (action.action === "approve") {
    if (isPaused(db)) {
      return {
        ok: false,
        draft_id: action.draft_id,
        lead_id: lead.id,
        error: "paused",
      };
    }
    transitionLead(db, lead.id, "APPROVED", {
      draft_id: draft.id,
      via: "approve",
    });
    return {
      ok: true,
      draft_id: draft.id,
      lead_id: lead.id,
      state: "APPROVED",
    };
  }

  if (action.action === "reject") {
    transitionLead(db, lead.id, "REJECTED", {
      draft_id: draft.id,
      reason: action.reason,
    });
    return {
      ok: true,
      draft_id: draft.id,
      lead_id: lead.id,
      state: "REJECTED",
    };
  }

  // edit
  updateDraft(db, draft.id, {
    body: action.body,
    subject: action.subject ?? draft.subject,
  });
  transitionLead(db, lead.id, "DRAFTED", {
    draft_id: draft.id,
    via: "edit",
  });
  transitionLead(db, lead.id, "PENDING_APPROVAL", {
    draft_id: draft.id,
    via: "edit_requeue",
  });
  return {
    ok: true,
    draft_id: draft.id,
    lead_id: lead.id,
    state: "PENDING_APPROVAL",
  };
}
