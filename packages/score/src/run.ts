import {
  getCompanyById,
  listContactsForCompany,
  listFactsForCompany,
  listLeadsByState,
  transitionLead,
  updateLeadScore,
  type OutreachDb,
} from "@sgm-outreach/core";
import { scoreLeadInput, type ScoreResult } from "./score.js";
import type { ScoreSignals } from "./signals.js";

/** Prefer structured enrichment signals from the ENRICHED event when present. */
function enrichmentSignals(
  db: OutreachDb,
  leadId: string,
): Partial<ScoreSignals> | undefined {
  const row = db
    .prepare(
      `SELECT meta FROM events
       WHERE lead_id = ? AND to_state = 'ENRICHED'
       ORDER BY at DESC LIMIT 1`,
    )
    .get(leadId) as { meta: string } | undefined;
  if (!row) return undefined;
  let meta: unknown;
  try {
    meta = JSON.parse(row.meta);
  } catch {
    return undefined;
  }
  if (!meta || typeof meta !== "object") return undefined;
  const enrichment = (meta as { enrichment?: unknown }).enrichment;
  if (!enrichment || typeof enrichment !== "object") return undefined;
  const signals = (enrichment as { signals?: unknown }).signals;
  if (!signals || typeof signals !== "object") return undefined;
  const s = signals as Record<string, unknown>;
  const out: Partial<ScoreSignals> = {};
  if (typeof s["shipping_evidence"] === "boolean") {
    out.shipping = s["shipping_evidence"];
  }
  if (typeof s["hiring_signal"] === "boolean") {
    out.hiring = s["hiring_signal"];
  }
  if (
    typeof s["team_size"] === "number" &&
    Number.isFinite(s["team_size"])
  ) {
    out.teamSize = s["team_size"];
  }
  const hints = s["segment_hints"];
  if (
    Array.isArray(hints) &&
    hints.some((h) => typeof h === "string" && h.length > 0)
  ) {
    out.segmentMatch = true;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export interface RunScoreOptions {
  db: OutreachDb;
  limit?: number;
}

export interface ScoredLeadResult extends ScoreResult {
  lead_id: string;
}

export interface RunScoreResult {
  scored: ScoredLeadResult[];
}

/**
 * Score ENRICHED leads and move each to SCORED regardless of threshold.
 * Re-running is idempotent because only ENRICHED leads are selected.
 */
export function runScore(options: RunScoreOptions): RunScoreResult {
  const leads = listLeadsByState(options.db, "ENRICHED", options.limit ?? 100);
  const scored: ScoredLeadResult[] = [];
  for (const lead of leads) {
    const company = getCompanyById(options.db, lead.company_id);
    if (!company) throw new Error(`Company not found for lead ${lead.id}`);
    const signals = enrichmentSignals(options.db, lead.id);
    const result = scoreLeadInput({
      company,
      contacts: listContactsForCompany(options.db, company.id),
      facts: listFactsForCompany(options.db, company.id),
      ...(signals ? { signals } : {}),
    });
    const persist = options.db.transaction(() => {
      updateLeadScore(options.db, lead.id, result.score);
      transitionLead(options.db, lead.id, "SCORED", {
        breakdown: result.breakdown,
      });
    });
    persist();
    scored.push({ lead_id: lead.id, ...result });
  }
  return { scored };
}
