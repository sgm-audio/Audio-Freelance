import {
  claimAllowlistPhrases,
  type ClaimsFile,
} from "@sgm-outreach/core";

/** Fabricated credential markers — never allowed (anti-drift). */
export const FABRICATED_CLAIM_MARKERS: readonly string[] = [
  "grammy",
  "forbes 30",
  "series a funding",
  "industry-leading plugin suite",
  "10 million users",
  "award-winning plugin",
  "yc-backed",
];

/**
 * Reject invented SGM credentials. Allowlisted phrases from claims.json may appear;
 * fabricated markers always fail.
 */
export function lintClaims(body: string, claims: ClaimsFile): string[] {
  const flags: string[] = [];
  const lower = body.toLowerCase();

  for (const marker of FABRICATED_CLAIM_MARKERS) {
    if (lower.includes(marker)) {
      flags.push(`fabricated_claim:${marker}`);
    }
  }

  const mentionsSgmCredential =
    /trackclear|reapack|portamento|makingmadi|17 years|sgm studios|currently shipping/i.test(
      body,
    );
  if (mentionsSgmCredential) {
    const phrases = claimAllowlistPhrases(claims).map((p) => p.toLowerCase());
    const hit = phrases.some((p) => lower.includes(p));
    if (!hit) {
      flags.push("claim_not_allowlisted");
    }
  }

  return flags;
}
