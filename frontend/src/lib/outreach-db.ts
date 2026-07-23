import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const LEAD_STATES = [
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

export type LeadState = (typeof LEAD_STATES)[number];

export const FUNNEL_STAGES: LeadState[] = [
  "NEW",
  "ENRICHED",
  "SCORED",
  "DRAFTED",
  "PENDING_APPROVAL",
  "APPROVED",
  "SENT",
  "REPLIED",
];

export type OutreachSource = "sqlite" | "empty-fixture";

export interface OutreachTotals {
  companies: number;
  contacts: number;
  leads: number;
  drafts: number;
  events: number;
  suppressions: number;
}

export interface ApprovalItem {
  id: string;
  state: LeadState;
  channel: string;
  score: number;
  updated_at: string;
  contact_name: string | null;
  contact_role: string | null;
  company_name: string | null;
  company_domain: string | null;
  subject: string | null;
  body_preview: string | null;
}

export interface LinkedInPasteItem {
  id: string;
  state: LeadState;
  score: number;
  updated_at: string;
  contact_name: string | null;
  contact_role: string | null;
  linkedin_url: string | null;
  company_name: string | null;
  subject: string | null;
  body: string | null;
  ready_to_paste: boolean;
}

export interface OutreachSnapshot {
  source: OutreachSource;
  db_path: string;
  db_exists: boolean;
  paused: boolean;
  generated_at: string;
  lead_counts: Record<LeadState, number>;
  totals: OutreachTotals;
  funnel: Array<{ state: LeadState; count: number }>;
  pending_approval: ApprovalItem[];
  linkedin_paste_queue: LinkedInPasteItem[];
  linkedin_warming: LinkedInPasteItem[];
}

function emptyCounts(): Record<LeadState, number> {
  const counts = {} as Record<LeadState, number>;
  for (const s of LEAD_STATES) counts[s] = 0;
  return counts;
}

/** Resolve SQLite path: SGM_OUTREACH_DB, else ../data or ./data from cwd */
export function resolveOutreachDbPath(): string {
  if (process.env.SGM_OUTREACH_DB) {
    return resolve(/* turbopackIgnore: true */ process.env.SGM_OUTREACH_DB);
  }
  const fromFrontend = resolve(
    /* turbopackIgnore: true */ process.cwd(),
    "..",
    "data",
    "outreach.sqlite",
  );
  if (existsSync(fromFrontend)) return fromFrontend;
  const fromRoot = resolve(
    /* turbopackIgnore: true */ process.cwd(),
    "data",
    "outreach.sqlite",
  );
  return fromRoot;
}

function countTable(db: DatabaseSync, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as
    | { n: number }
    | undefined;
  return row?.n ?? 0;
}

function previewBody(body: string | null, max = 160): string | null {
  if (!body) return null;
  const flat = body.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1)}…`;
}

function emptyFixture(dbPath: string): OutreachSnapshot {
  const lead_counts = emptyCounts();
  return {
    source: "empty-fixture",
    db_path: dbPath,
    db_exists: false,
    paused: false,
    generated_at: new Date().toISOString(),
    lead_counts,
    totals: {
      companies: 0,
      contacts: 0,
      leads: 0,
      drafts: 0,
      events: 0,
      suppressions: 0,
    },
    funnel: FUNNEL_STAGES.map((state) => ({ state, count: 0 })),
    pending_approval: [],
    linkedin_paste_queue: [],
    linkedin_warming: [],
  };
}

export function loadOutreachSnapshot(): OutreachSnapshot {
  const dbPath = resolveOutreachDbPath();
  if (!existsSync(dbPath)) {
    return emptyFixture(dbPath);
  }

  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const lead_counts = emptyCounts();
    const stateRows = db
      .prepare("SELECT state, COUNT(*) AS n FROM leads GROUP BY state")
      .all() as Array<{ state: string; n: number }>;
    for (const row of stateRows) {
      if ((LEAD_STATES as readonly string[]).includes(row.state)) {
        lead_counts[row.state as LeadState] = Number(row.n);
      }
    }

    const pausedRow = db
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get("paused") as { value: string } | undefined;

    const pending_approval = (
      db
        .prepare(
          `SELECT l.id, l.state, l.channel, l.score, l.updated_at,
                  c.name AS contact_name, c.role AS contact_role,
                  co.name AS company_name, co.domain AS company_domain,
                  d.subject, d.body
           FROM leads l
           LEFT JOIN contacts c ON c.id = l.contact_id
           LEFT JOIN companies co ON co.id = l.company_id
           LEFT JOIN drafts d ON d.lead_id = l.id
           WHERE l.state = 'PENDING_APPROVAL'
           ORDER BY l.updated_at DESC
           LIMIT 40`,
        )
        .all() as Array<{
        id: string;
        state: string;
        channel: string;
        score: number;
        updated_at: string;
        contact_name: string | null;
        contact_role: string | null;
        company_name: string | null;
        company_domain: string | null;
        subject: string | null;
        body: string | null;
      }>
    ).map((row) => ({
      id: row.id,
      state: row.state as LeadState,
      channel: row.channel,
      score: row.score,
      updated_at: row.updated_at,
      contact_name: row.contact_name,
      contact_role: row.contact_role,
      company_name: row.company_name,
      company_domain: row.company_domain,
      subject: row.subject,
      body_preview: previewBody(row.body),
    }));

    const linkedinRows = db
      .prepare(
        `SELECT l.id, l.state, l.score, l.updated_at,
                c.name AS contact_name, c.role AS contact_role, c.linkedin_url,
                co.name AS company_name,
                d.subject, d.body
         FROM leads l
         LEFT JOIN contacts c ON c.id = l.contact_id
         LEFT JOIN companies co ON co.id = l.company_id
         LEFT JOIN drafts d ON d.lead_id = l.id
         WHERE l.channel = 'linkedin'
         ORDER BY l.updated_at DESC
         LIMIT 60`,
      )
      .all() as Array<{
      id: string;
      state: string;
      score: number;
      updated_at: string;
      contact_name: string | null;
      contact_role: string | null;
      linkedin_url: string | null;
      company_name: string | null;
      subject: string | null;
      body: string | null;
    }>;

    const mapLi = (row: (typeof linkedinRows)[number]): LinkedInPasteItem => ({
      id: row.id,
      state: row.state as LeadState,
      score: row.score,
      updated_at: row.updated_at,
      contact_name: row.contact_name,
      contact_role: row.contact_role,
      linkedin_url: row.linkedin_url,
      company_name: row.company_name,
      subject: row.subject,
      body: row.body,
      ready_to_paste:
        Boolean(row.body) &&
        (row.state === "APPROVED" || row.state === "PENDING_APPROVAL"),
    });

    const linkedin_paste_queue = linkedinRows
      .filter((r) =>
        ["APPROVED", "PENDING_APPROVAL", "DRAFTED"].includes(r.state),
      )
      .map(mapLi);

    const linkedin_warming = linkedinRows
      .filter((r) => !["APPROVED", "PENDING_APPROVAL", "DRAFTED", "SENT", "REPLIED"].includes(r.state))
      .map(mapLi);

    const totals: OutreachTotals = {
      companies: countTable(db, "companies"),
      contacts: countTable(db, "contacts"),
      leads: countTable(db, "leads"),
      drafts: countTable(db, "drafts"),
      events: countTable(db, "events"),
      suppressions: countTable(db, "suppressions"),
    };

    return {
      source: "sqlite",
      db_path: dbPath,
      db_exists: true,
      paused: pausedRow?.value === "1",
      generated_at: new Date().toISOString(),
      lead_counts,
      totals,
      funnel: FUNNEL_STAGES.map((state) => ({
        state,
        count: lead_counts[state],
      })),
      pending_approval,
      linkedin_paste_queue,
      linkedin_warming,
    };
  } finally {
    db.close();
  }
}

export function setOutreachPaused(paused: boolean): { ok: true; paused: boolean; db_path: string } {
  const dbPath = resolveOutreachDbPath();
  if (!existsSync(dbPath)) {
    throw new Error(`Outreach DB not found at ${dbPath}`);
  }
  const db = new DatabaseSync(dbPath);
  try {
    db.prepare(
      `INSERT INTO settings (key, value) VALUES ('paused', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).run(paused ? "1" : "0");
    return { ok: true, paused, db_path: dbPath };
  } finally {
    db.close();
  }
}
