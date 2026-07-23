import { SCORE_THRESHOLD } from "@sgm-outreach/core";
import type { Company, Contact, Fact } from "@sgm-outreach/core";
import { isSegmentMatch, parseSignalsFromFacts, type ScoreSignals } from "./signals.js";

const TECHNICAL_ROLE_PATTERN =
  /\b(?:cto|chief\s+technology\s+officer|technical|engineer(?:ing)?|developer|programmer|dsp|audio|product|founder|owner)\b/i;

function hasNamedTechnicalContact(contacts: readonly Contact[]): boolean {
  return contacts.some(
    (contact) =>
      Boolean(contact.email) ||
      (contact.name.trim().length > 0 &&
        contact.role !== null &&
        TECHNICAL_ROLE_PATTERN.test(contact.role)),
  );
}

function hasContactPath(contacts: readonly Contact[]): boolean {
  return contacts.some(
    (contact) =>
      Boolean(contact.email) ||
      Boolean(contact.linkedin_url) ||
      (contact.name.trim().length > 0 &&
        contact.role !== null &&
        TECHNICAL_ROLE_PATTERN.test(contact.role)),
  );
}

export interface ScoreLeadInput {
  company: Company;
  contacts: readonly Contact[];
  facts: readonly Fact[];
  signals?: Partial<ScoreSignals>;
}

export interface ScoreResult {
  score: number;
  breakdown: Record<string, number>;
}

/** Apply the fixed M2 weights. This function performs no I/O and uses no LLM. */
export function scoreLeadInput(input: ScoreLeadInput): ScoreResult {
  const parsed = parseSignalsFromFacts(input.facts);
  const signals = { ...parsed, ...input.signals };
  const breakdown = {
    segment_match:
      isSegmentMatch(input.company.segment) || signals.segmentMatch === true
        ? 30
        : 0,
    small_team:
      signals.teamSize !== undefined && signals.teamSize <= 15 ? 20 : 0,
    shipping_evidence: signals.shipping === true ? 20 : 0,
    technical_contact: hasNamedTechnicalContact(input.contacts) ? 15 : 0,
    hiring_signal: signals.hiring === true ? 15 : 0,
    no_contact_path: hasContactPath(input.contacts) ? 0 : -50,
  };
  return {
    score: Object.values(breakdown).reduce((total, value) => total + value, 0),
    breakdown,
  };
}

export function meetsScoreThreshold(score: number): boolean {
  return score >= SCORE_THRESHOLD;
}
