/** Cadence days from current state updated_at (OUTREACH_BUILD_SPEC §6). */
export const FOLLOWUP_CADENCE = {
  /** SENT → NO_REPLY / day-4 bump eligibility */
  day4: 4,
  /** FOLLOWUP_1 → day-10 value-add */
  day10: 10,
  /** FOLLOWUP_2 → day-60 nurture */
  day60: 60,
} as const;

export type FollowupKind = "day4" | "day10" | "day60";

export function daysBetween(fromIso: string, to: Date): number {
  const from = Date.parse(fromIso);
  if (Number.isNaN(from)) throw new Error(`Invalid date: ${fromIso}`);
  const ms = to.getTime() - from;
  return ms / (24 * 60 * 60 * 1000);
}

export function isDue(
  updatedAt: string,
  now: Date,
  minDays: number,
): boolean {
  return daysBetween(updatedAt, now) >= minDays;
}

export function followupModel(kind: FollowupKind): string {
  return `followup-${kind}`;
}

export function parseFollowupKind(model: string): FollowupKind | null {
  if (model === "followup-day4") return "day4";
  if (model === "followup-day10") return "day10";
  if (model === "followup-day60") return "day60";
  return null;
}

/** After approve+send of a followup draft, land in this state. */
export function nextStateAfterFollowupSend(
  kind: FollowupKind,
): "FOLLOWUP_1" | "FOLLOWUP_2" | "NURTURE" {
  if (kind === "day4") return "FOLLOWUP_1";
  if (kind === "day10") return "FOLLOWUP_2";
  return "NURTURE";
}
