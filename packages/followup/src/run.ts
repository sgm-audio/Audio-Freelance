import {
  getCompanyById,
  getContactById,
  insertDraft,
  listFactsForCompany,
  listLeadsByState,
  transitionLead,
  type Lead,
  type OutreachDb,
} from "@sgm-outreach/core";
import {
  FOLLOWUP_CADENCE,
  followupModel,
  isDue,
  type FollowupKind,
} from "./cadence.js";

export interface RunFollowupOptions {
  db: OutreachDb;
  /** Injected clock for tests. */
  now?: Date;
  dryRun?: boolean;
  limit?: number;
}

export interface FollowupAction {
  lead_id: string;
  kind: FollowupKind;
  draft_id?: string;
  dry_run?: boolean;
}

export interface RunFollowupResult {
  actions: FollowupAction[];
  marked_no_reply: string[];
}

function templateBody(
  kind: FollowupKind,
  contactName: string,
  companyName: string,
  fact: string | null,
): string {
  const first = contactName.split(/\s+/)[0] ?? contactName;
  if (kind === "day4") {
    return `Hi ${first} — quick bump on my note about ${companyName}. ${fact ? `Still thinking about ${fact}. ` : ""}Happy to do a 20-minute call if useful.`;
  }
  if (kind === "day10") {
    return `Hi ${first} — sharing a public TrackClear ReaPack listing in case it helps your audio tooling stack at ${companyName}. Open to a short call.`;
  }
  return `Hi ${first} — checking in from SGM Studios. If ${companyName} ever needs real-time DSP/on-device ML help, I'm around.`;
}

function draftFollowup(
  db: OutreachDb,
  lead: Lead,
  kind: FollowupKind,
  dryRun: boolean,
): FollowupAction {
  const company = getCompanyById(db, lead.company_id);
  const contact = lead.contact_id
    ? getContactById(db, lead.contact_id)
    : null;
  const facts = company ? listFactsForCompany(db, company.id) : [];
  const fact = facts[0]?.fact ?? null;
  const body = templateBody(
    kind,
    contact?.name ?? "there",
    company?.name ?? "your team",
    fact,
  ).replace(/—/g, "-"); // avoid ban-list em-dash chains on multi-em-dash templates

  if (dryRun) {
    return { lead_id: lead.id, kind, dry_run: true };
  }

  // Enter approval loop: current → DRAFTED → PENDING_APPROVAL
  transitionLead(db, lead.id, "DRAFTED", { followup: kind });
  const draft = insertDraft(db, {
    lead_id: lead.id,
    subject:
      kind === "day4"
        ? "Following up"
        : kind === "day10"
          ? "Resource that may help"
          : "Staying in touch",
    body,
    personalization_fact_id: facts[0]?.id ?? null,
    model: followupModel(kind),
  });
  transitionLead(db, lead.id, "PENDING_APPROVAL", {
    draft_id: draft.id,
    followup: kind,
  });
  return { lead_id: lead.id, kind, draft_id: draft.id };
}

/**
 * Hourly-capable runner:
 * - SENT past 4d → NO_REPLY, then draft day-4 followup into PENDING_APPROVAL
 * - FOLLOWUP_1 past 10d → day-10 draft
 * - FOLLOWUP_2 past 60d → day-60 nurture draft
 */
export function runFollowup(options: RunFollowupOptions): RunFollowupResult {
  const now = options.now ?? new Date();
  const dryRun = options.dryRun ?? false;
  const limit = options.limit ?? 100;
  const actions: FollowupAction[] = [];
  const markedNoReply: string[] = [];

  const sent = listLeadsByState(options.db, "SENT", limit);
  for (const lead of sent) {
    if (!isDue(lead.updated_at, now, FOLLOWUP_CADENCE.day4)) continue;
    if (dryRun) {
      markedNoReply.push(lead.id);
      actions.push({ lead_id: lead.id, kind: "day4", dry_run: true });
      continue;
    }
    transitionLead(options.db, lead.id, "NO_REPLY", {
      reason: "no_reply_day4",
      at: now.toISOString(),
    });
    markedNoReply.push(lead.id);
    const refreshed = listLeadsByState(options.db, "NO_REPLY").find(
      (l) => l.id === lead.id,
    );
    if (refreshed) {
      actions.push(draftFollowup(options.db, refreshed, "day4", false));
    }
  }

  // NO_REPLY already (e.g. set externally) without draft yet — also eligible
  for (const lead of listLeadsByState(options.db, "NO_REPLY", limit)) {
    if (actions.some((a) => a.lead_id === lead.id)) continue;
    if (!isDue(lead.updated_at, now, 0)) continue;
    actions.push(draftFollowup(options.db, lead, "day4", dryRun));
  }

  for (const lead of listLeadsByState(options.db, "FOLLOWUP_1", limit)) {
    if (!isDue(lead.updated_at, now, FOLLOWUP_CADENCE.day10)) continue;
    actions.push(draftFollowup(options.db, lead, "day10", dryRun));
  }

  for (const lead of listLeadsByState(options.db, "FOLLOWUP_2", limit)) {
    if (!isDue(lead.updated_at, now, FOLLOWUP_CADENCE.day60)) continue;
    actions.push(draftFollowup(options.db, lead, "day60", dryRun));
  }

  return { actions, marked_no_reply: markedNoReply };
}
