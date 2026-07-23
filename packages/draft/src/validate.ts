import {
  DraftOutputSchema,
  type Channel,
  type ClaimsFile,
  type DraftOutput,
} from "@sgm-outreach/core";
import { lintBanList } from "./banlist.js";
import { lintClaims } from "./claims-lint.js";

const WORD_LIMITS: Record<Channel, number> = {
  email: 120,
  linkedin: 80,
  upwork: 200,
};

export function wordCount(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

export class DraftValidationError extends Error {
  readonly flags: string[];
  constructor(flags: string[]) {
    super(`Draft validation failed: ${flags.join("; ")}`);
    this.flags = flags;
    this.name = "DraftValidationError";
  }
}

/**
 * Zod-parse + ban-list + claims allowlist + word limit.
 * Throws DraftValidationError when lint fails.
 */
export function validateDraftOutput(
  raw: unknown,
  channel: Channel,
  claims: ClaimsFile,
  expectedFact: string,
): DraftOutput {
  const parsed = DraftOutputSchema.parse(raw);
  const flags = [
    ...lintBanList(parsed.body),
    ...lintClaims(parsed.body, claims),
  ];

  if (parsed.fact_used.trim() !== expectedFact.trim()) {
    // Soft: fact_used must reference the provided fact (substring OK either way).
    const a = parsed.fact_used.toLowerCase();
    const b = expectedFact.toLowerCase();
    if (!a.includes(b) && !b.includes(a) && !parsed.body.toLowerCase().includes(b.slice(0, 40))) {
      flags.push("fact_not_referenced");
    }
  }

  const limit = WORD_LIMITS[channel];
  const words = wordCount(parsed.body);
  if (words > limit) {
    flags.push(`word_limit:${words}>${limit}`);
  }

  if (flags.length > 0) {
    throw new DraftValidationError(flags);
  }

  return {
    ...parsed,
    risk_flags: [...parsed.risk_flags, ...flags],
  };
}
