import {
  SCORE_THRESHOLD,
  getCompanyById,
  getContactById,
  insertDraft,
  listFactsForCompany,
  listLeadsByState,
  loadClaimsFile,
  transitionLead,
  type ClaimsFile,
  type Draft,
  type Lead,
  type OutreachDb,
} from "@sgm-outreach/core";
import { createDraftLlmClient, type DraftLlmClient } from "./llm.js";
import { buildDraftPrompt, fixtureDraftOutput } from "./prompt.js";
import {
  DraftValidationError,
  validateDraftOutput,
} from "./validate.js";

export interface RunDraftOptions {
  db: OutreachDb;
  limit?: number;
  claimsPath?: string;
  claims?: ClaimsFile;
  /** Inject LLM (tests). */
  llm?: DraftLlmClient;
  /** Use built-in fixture drafter (no network). */
  useFixtureDrafter?: boolean;
  maxRetries?: number;
}

export interface DraftedLeadResult {
  lead_id: string;
  draft_id: string;
  model: string;
}

export interface SkippedLeadResult {
  lead_id: string;
  reason: string;
}

export interface RunDraftResult {
  drafted: DraftedLeadResult[];
  skipped: SkippedLeadResult[];
}

function pickFact(
  facts: ReturnType<typeof listFactsForCompany>,
): (typeof facts)[number] | null {
  if (facts.length === 0) return null;
  // Prefer longer concrete facts.
  return [...facts].sort((a, b) => b.fact.length - a.fact.length)[0] ?? null;
}

async function generateValidated(
  llm: DraftLlmClient,
  prompt: string,
  channel: Lead["channel"],
  claims: ClaimsFile,
  factText: string,
  maxRetries: number,
): Promise<ReturnType<typeof validateDraftOutput>> {
  let lastErr: unknown;
  let fullPrompt = prompt;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const raw = await llm.complete(fullPrompt);
      return validateDraftOutput(raw, channel, claims, factText);
    } catch (err) {
      lastErr = err;
      const msg =
        err instanceof DraftValidationError
          ? err.flags.join("; ")
          : err instanceof Error
            ? err.message
            : String(err);
      fullPrompt = `${prompt}\n\nPrevious attempt failed validation: ${msg}. Fix and return JSON only.`;
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`Draft generation failed: ${String(lastErr)}`);
}

/**
 * SCORED (≥ threshold) → draft → DRAFTED → PENDING_APPROVAL.
 * No fact → skip (manual research flag via skipped reason).
 */
export async function runDraft(
  options: RunDraftOptions,
): Promise<RunDraftResult> {
  const claims =
    options.claims ?? loadClaimsFile(options.claimsPath);
  const maxRetries = options.maxRetries ?? 2;
  const leads = listLeadsByState(
    options.db,
    "SCORED",
    options.limit ?? 100,
  ).filter((l) => l.score >= SCORE_THRESHOLD);

  const drafted: DraftedLeadResult[] = [];
  const skipped: SkippedLeadResult[] = [];

  let llm = options.llm;
  if (!llm && options.useFixtureDrafter) {
    llm = {
      kind: "fixture",
      complete: async () => {
        throw new Error("fixture client must be per-lead");
      },
    };
  }
  if (!llm && !options.useFixtureDrafter) {
    llm = await createDraftLlmClient();
  }

  for (const lead of leads) {
    const company = getCompanyById(options.db, lead.company_id);
    if (!company) {
      skipped.push({ lead_id: lead.id, reason: "missing_company" });
      continue;
    }
    if (!lead.contact_id) {
      skipped.push({ lead_id: lead.id, reason: "missing_contact" });
      continue;
    }
    const contact = getContactById(options.db, lead.contact_id);
    if (!contact) {
      skipped.push({ lead_id: lead.id, reason: "missing_contact_row" });
      continue;
    }
    const fact = pickFact(listFactsForCompany(options.db, company.id));
    if (!fact) {
      skipped.push({
        lead_id: lead.id,
        reason: "no_fact_manual_research",
      });
      continue;
    }

    try {
      let output;
      let model: string;
      if (options.useFixtureDrafter) {
        output = validateDraftOutput(
          fixtureDraftOutput({
            channel: lead.channel,
            contact,
            companyName: company.name,
            fact,
          }),
          lead.channel,
          claims,
          fact.fact,
        );
        model = "fixture";
      } else {
        const prompt = buildDraftPrompt({
          channel: lead.channel,
          contact,
          companyName: company.name,
          fact,
          claimsTexts: claims.claims.map((c) => c.text),
        });
        output = await generateValidated(
          llm!,
          prompt,
          lead.channel,
          claims,
          fact.fact,
          maxRetries,
        );
        model = llm!.kind;
      }

      const draft: Draft = insertDraft(options.db, {
        lead_id: lead.id,
        subject: output.subject ?? null,
        body: output.body,
        personalization_fact_id: fact.id,
        model,
      });
      transitionLead(options.db, lead.id, "DRAFTED", {
        draft_id: draft.id,
        fact_id: fact.id,
        evidence_url: fact.evidence_url,
      });
      transitionLead(options.db, lead.id, "PENDING_APPROVAL", {
        draft_id: draft.id,
      });
      drafted.push({
        lead_id: lead.id,
        draft_id: draft.id,
        model,
      });
    } catch (err) {
      skipped.push({
        lead_id: lead.id,
        reason:
          err instanceof DraftValidationError
            ? `validation:${err.flags.join(",")}`
            : err instanceof Error
              ? err.message
              : String(err),
      });
    }
  }

  return { drafted, skipped };
}

/** Validate a raw draft body/object without DB (unit tests). */
export { validateDraftOutput, DraftValidationError } from "./validate.js";
export { lintBanList } from "./banlist.js";
export { lintClaims } from "./claims-lint.js";
