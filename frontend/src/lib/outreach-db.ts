/**
 * Frontend shapes and requests for the SGM Outreach console.
 *
 * The engine's SQLite database is read by the FastAPI backend
 * (`GET /api/v1/outreach/status`); the browser only talks to Next.js route
 * handlers, which proxy through the same-origin backend proxy. No values are
 * generated client-side — an absent database yields honest zeros from the API.
 */

/** Keep in sync with LeadStateSchema in packages/core/src/schemas.ts. */
export const OUTREACH_STATES = [
  "NEW",
  "ENRICHED",
  "SCORED",
  "DRAFTED",
  "PENDING_APPROVAL",
  "APPROVED",
  "SENT",
  "REPLIED",
  "NO_REPLY",
  "FOLLOWUP_1",
  "FOLLOWUP_2",
  "NURTURE",
  "HUMAN",
  "REJECTED",
  "BOUNCED",
  "UNSUBSCRIBED",
] as const;

export type OutreachLeadState = (typeof OUTREACH_STATES)[number];

export interface OutreachQueueItem {
  id: string;
  contact_name?: string | null;
  company_name?: string | null;
  company_domain?: string | null;
  contact_role?: string | null;
  score: number;
  channel: string;
  updated_at: string;
  state?: string;
  subject?: string | null;
  body_preview?: string | null;
  body?: string | null;
  linkedin_url?: string | null;
  ready_to_paste?: boolean;
}

export interface OutreachSnapshot {
  lead_counts: Record<OutreachLeadState, number>;
  funnel: Array<{ state: string; count: number }>;
  paused: boolean;
  source: string;
  db_exists: boolean;
  totals: {
    companies: number;
    contacts: number;
    leads: number;
    drafts: number;
    suppressions: number;
  };
  generated_at: string;
  pending_approval: OutreachQueueItem[];
  linkedin_paste_queue: OutreachQueueItem[];
  linkedin_warming: OutreachQueueItem[];
  db_path: string;
  timestamp: string;
}

/** A clearly-labelled placeholder for loading/error states — never real data. */
export function emptyOutreachSnapshot(source: string): OutreachSnapshot {
  const timestamp = new Date().toISOString();
  return {
    lead_counts: Object.fromEntries(OUTREACH_STATES.map((s) => [s, 0])) as Record<
      OutreachLeadState,
      number
    >,
    funnel: [],
    paused: false,
    source,
    db_exists: false,
    totals: { companies: 0, contacts: 0, leads: 0, drafts: 0, suppressions: 0 },
    generated_at: timestamp,
    pending_approval: [],
    linkedin_paste_queue: [],
    linkedin_warming: [],
    db_path: "",
    timestamp,
  };
}

async function errorMessage(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as {
    detail?: string;
    error?: string;
  };
  return body.detail ?? body.error ?? `status ${res.status}`;
}

export async function fetchOutreachSnapshot(): Promise<OutreachSnapshot> {
  const res = await fetch("/api/outreach", { cache: "no-store" });
  if (!res.ok) throw new Error(await errorMessage(res));
  return (await res.json()) as OutreachSnapshot;
}

export async function setOutreachPaused(paused: boolean): Promise<OutreachSnapshot> {
  const res = await fetch("/api/outreach/kill-switch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paused }),
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  return (await res.json()) as OutreachSnapshot;
}
