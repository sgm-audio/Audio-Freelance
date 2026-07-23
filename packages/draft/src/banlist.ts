/** Phrases banned in every draft (OUTREACH_BUILD_SPEC §4). */
export const BAN_PHRASES: readonly string[] = [
  "i hope this finds you well",
  "i came across",
  "synergy",
];

/** Em-dash chain: two+ em dashes, or three+ hyphen runs used as flourish. */
const EM_DASH_CHAIN = /—[^—\n]{0,40}—|-{3,}/;

export function lintBanList(body: string): string[] {
  const flags: string[] = [];
  const lower = body.toLowerCase();
  for (const phrase of BAN_PHRASES) {
    if (lower.includes(phrase)) {
      flags.push(`ban:${phrase}`);
    }
  }
  if (EM_DASH_CHAIN.test(body)) {
    flags.push("ban:em-dash-chain");
  }
  return flags;
}
