import { randomUUID } from "node:crypto";
import type { OutreachDb } from "./db.js";
import {
  ChannelSchema,
  CompanySchema,
  ContactSchema,
  DraftSchema,
  FactSchema,
  LeadSchema,
  LeadStateSchema,
  SuppressionSchema,
  type Channel,
  type Company,
  type Contact,
  type Draft,
  type Fact,
  type Lead,
  type LeadState,
  type Suppression,
} from "./schemas.js";
import {
  assertTransition,
  canTransition,
  isTerminal,
} from "./state-machine.js";

/** Normalize a company website/domain for dedupe. Returns null if unusable. */
export function normalizeDomain(raw: string): string | null {
  let s = raw.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^https?:\/\//, "");
  s = s.replace(/^www\./, "");
  const host = s.split("/")[0]?.split("?")[0]?.split(":")[0] ?? "";
  if (!host || !host.includes(".") || /\s/.test(host)) return null;
  // reject bare TLDs / apple app store hosts as "company domains"
  if (host.endsWith(".apple.com") || host === "apps.apple.com") return null;
  return host;
}

export interface UpsertCompanyInput {
  name: string;
  domain: string;
  tier?: number;
  segment?: string;
  source: string;
}

export function findCompanyByDomain(
  db: OutreachDb,
  domain: string,
): Company | null {
  const normalized = normalizeDomain(domain);
  if (!normalized) return null;
  const row = db
    .prepare("SELECT * FROM companies WHERE domain = ? COLLATE NOCASE")
    .get(normalized);
  if (!row) return null;
  return CompanySchema.parse(row);
}

export function getCompanyById(
  db: OutreachDb,
  companyId: string,
): Company | null {
  const row = db.prepare("SELECT * FROM companies WHERE id = ?").get(companyId);
  return row ? CompanySchema.parse(row) : null;
}

/** Insert company or return existing row matched by normalized domain. */
export function upsertCompany(
  db: OutreachDb,
  input: UpsertCompanyInput,
): { company: Company; created: boolean } {
  const domain = normalizeDomain(input.domain);
  if (!domain) throw new Error(`Invalid domain: ${input.domain}`);
  const existing = findCompanyByDomain(db, domain);
  if (existing) return { company: existing, created: false };
  const company = CompanySchema.parse({
    id: randomUUID(),
    name: input.name.trim(),
    domain,
    tier: input.tier ?? 0,
    segment: input.segment ?? "unknown",
    source: input.source,
    created_at: new Date().toISOString(),
  });
  db.prepare(
    `INSERT INTO companies (id, name, domain, tier, segment, source, created_at)
     VALUES (@id, @name, @domain, @tier, @segment, @source, @created_at)`,
  ).run(company);
  return { company, created: true };
}

export interface InsertContactInput {
  company_id: string;
  name: string;
  role?: string | null;
  email?: string | null;
  linkedin_url?: string | null;
  email_source?: string | null;
}

export function insertContact(
  db: OutreachDb,
  input: InsertContactInput,
): Contact {
  const contact = ContactSchema.parse({
    id: randomUUID(),
    company_id: input.company_id,
    name: input.name.trim(),
    role: input.role ?? null,
    email: input.email ?? null,
    linkedin_url: input.linkedin_url ?? null,
    email_source: input.email_source ?? null,
  });
  db.prepare(
    `INSERT INTO contacts (id, company_id, name, role, email, linkedin_url, email_source)
     VALUES (@id, @company_id, @name, @role, @email, @linkedin_url, @email_source)`,
  ).run(contact);
  return contact;
}

export function getContactById(
  db: OutreachDb,
  contactId: string,
): Contact | null {
  const row = db.prepare("SELECT * FROM contacts WHERE id = ?").get(contactId);
  return row ? ContactSchema.parse(row) : null;
}

export function findContactByEmail(
  db: OutreachDb,
  email: string,
): Contact | null {
  const row = db
    .prepare("SELECT * FROM contacts WHERE email = ? COLLATE NOCASE")
    .get(email.trim().toLowerCase());
  return row ? ContactSchema.parse(row) : null;
}

export function listContactsForCompany(
  db: OutreachDb,
  companyId: string,
): Contact[] {
  const rows = db
    .prepare("SELECT * FROM contacts WHERE company_id = ? ORDER BY rowid")
    .all(companyId);
  return rows.map((row) => ContactSchema.parse(row));
}

export interface InsertFactInput {
  company_id: string;
  fact: string;
  evidence_url: string;
  extracted_at?: string;
}

export function insertFact(db: OutreachDb, input: InsertFactInput): Fact {
  const fact = FactSchema.parse({
    id: randomUUID(),
    company_id: input.company_id,
    fact: input.fact.trim(),
    evidence_url: input.evidence_url,
    extracted_at: input.extracted_at ?? new Date().toISOString(),
  });
  db.prepare(
    `INSERT INTO facts (id, company_id, fact, evidence_url, extracted_at)
     VALUES (@id, @company_id, @fact, @evidence_url, @extracted_at)`,
  ).run(fact);
  return fact;
}

export function listFactsForCompany(
  db: OutreachDb,
  companyId: string,
): Fact[] {
  const rows = db
    .prepare(
      "SELECT * FROM facts WHERE company_id = ? ORDER BY extracted_at, rowid",
    )
    .all(companyId);
  return rows.map((row) => FactSchema.parse(row));
}

export interface EnsureLeadInput {
  company_id: string;
  contact_id?: string | null;
  channel: Channel;
}

/**
 * Create a NEW lead if one does not already exist for this company/channel
 * (and contact when provided). Idempotent.
 */
export function ensureLead(
  db: OutreachDb,
  input: EnsureLeadInput,
): { lead: Lead; created: boolean } {
  const channel = ChannelSchema.parse(input.channel);
  const contactId = input.contact_id ?? null;
  let row: unknown;
  if (contactId) {
    row = db
      .prepare(`SELECT * FROM leads WHERE contact_id = ? AND channel = ?`)
      .get(contactId, channel);
  } else {
    row = db
      .prepare(
        `SELECT * FROM leads
         WHERE company_id = ? AND channel = ? AND contact_id IS NULL`,
      )
      .get(input.company_id, channel);
  }
  if (row) return { lead: LeadSchema.parse(row), created: false };
  const now = new Date().toISOString();
  const lead = LeadSchema.parse({
    id: randomUUID(),
    company_id: input.company_id,
    contact_id: contactId,
    channel,
    state: "NEW",
    score: 0,
    updated_at: now,
  });
  const run = db.transaction(() => {
    db.prepare(
      `INSERT INTO leads (id, company_id, contact_id, channel, state, score, updated_at)
       VALUES (@id, @company_id, @contact_id, @channel, @state, @score, @updated_at)`,
    ).run(lead);
    db.prepare(
      `INSERT INTO events (id, lead_id, from_state, to_state, meta, at)
       VALUES (?, ?, NULL, ?, ?, ?)`,
    ).run(
      randomUUID(),
      lead.id,
      "NEW",
      JSON.stringify({ source: "ingest" }),
      now,
    );
  });
  run();
  return { lead, created: true };
}

export function getLeadById(db: OutreachDb, leadId: string): Lead | null {
  const row = db.prepare("SELECT * FROM leads WHERE id = ?").get(leadId);
  return row ? LeadSchema.parse(row) : null;
}

const ALL_STATES = LeadStateSchema.options;

function emptyCounts(): Record<LeadState, number> {
  const counts = {} as Record<LeadState, number>;
  for (const s of ALL_STATES) counts[s] = 0;
  return counts;
}

export interface PipelineStatus {
  paused: boolean;
  db_path: string;
  lead_counts: Record<LeadState, number>;
  totals: {
    companies: number;
    contacts: number;
    leads: number;
    drafts: number;
    events: number;
    suppressions: number;
  };
}

export function getPipelineStatus(
  db: OutreachDb,
  dbPath: string,
): PipelineStatus {
  const pausedRow = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get("paused") as { value: string } | undefined;
  const counts = emptyCounts();
  const rows = db
    .prepare("SELECT state, COUNT(*) AS n FROM leads GROUP BY state")
    .all() as Array<{ state: string; n: number }>;
  for (const row of rows) {
    const parsed = LeadStateSchema.safeParse(row.state);
    if (parsed.success) counts[parsed.data] = row.n;
  }
  const TABLES = [
    "companies",
    "contacts",
    "leads",
    "drafts",
    "events",
    "suppressions",
  ] as const;
  const countTable = (table: (typeof TABLES)[number]) => {
    const r = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as {
      n: number;
    };
    return r.n;
  };
  return {
    paused: pausedRow?.value === "1",
    db_path: dbPath,
    lead_counts: counts,
    totals: {
      companies: countTable("companies"),
      contacts: countTable("contacts"),
      leads: countTable("leads"),
      drafts: countTable("drafts"),
      events: countTable("events"),
      suppressions: countTable("suppressions"),
    },
  };
}

export function setPaused(db: OutreachDb, paused: boolean): void {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('paused', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(paused ? "1" : "0");
}

export function isPaused(db: OutreachDb): boolean {
  const pausedRow = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get("paused") as { value: string } | undefined;
  return pausedRow?.value === "1";
}

export function isEmailSuppressed(db: OutreachDb, email: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    // Fail closed: empty/invalid addresses are treated as suppressed.
    return true;
  }
  const row = db
    .prepare("SELECT email FROM suppressions WHERE email = ? COLLATE NOCASE")
    .get(normalized);
  return Boolean(row);
}

/** Insert or refresh a suppression row (idempotent on email). */
export function addSuppression(
  db: OutreachDb,
  email: string,
  reason: string,
): Suppression {
  const suppression = SuppressionSchema.parse({
    email: email.trim().toLowerCase(),
    reason: reason.trim(),
    at: new Date().toISOString(),
  });
  db.prepare(
    `INSERT INTO suppressions (email, reason, at) VALUES (@email, @reason, @at)
     ON CONFLICT(email) DO UPDATE SET reason = excluded.reason, at = excluded.at`,
  ).run(suppression);
  return suppression;
}

/**
 * Record unsubscribe: suppression + UNSUBSCRIBED for every non-terminal lead
 * tied to this contact email.
 */
export function unsubscribeEmail(
  db: OutreachDb,
  email: string,
): { suppression: Suppression; lead_ids: string[] } {
  const normalized = email.trim().toLowerCase();
  const run = db.transaction(() => {
    const suppression = addSuppression(db, normalized, "unsubscribe");
    const contact = findContactByEmail(db, normalized);
    const leadIds: string[] = [];
    if (contact) {
      const leads = db
        .prepare("SELECT id, state FROM leads WHERE contact_id = ?")
        .all(contact.id) as Array<{ id: string; state: string }>;
      for (const row of leads) {
        const state = LeadStateSchema.parse(row.state);
        if (isTerminal(state)) continue;
        if (!canTransition(state, "UNSUBSCRIBED")) continue;
        transitionLead(db, row.id, "UNSUBSCRIBED", {
          reason: "unsubscribe",
          email: normalized,
        });
        leadIds.push(row.id);
      }
    }
    return { suppression, lead_ids: leadIds };
  });
  return run();
}

/** Latest draft for a lead (by created_at), or null. */
export function getLatestDraftForLead(
  db: OutreachDb,
  leadId: string,
): Draft | null {
  const row = db
    .prepare(
      `SELECT * FROM drafts WHERE lead_id = ?
       ORDER BY created_at DESC, rowid DESC LIMIT 1`,
    )
    .get(leadId);
  return row ? DraftSchema.parse(row) : null;
}

export function insertDraft(
  db: OutreachDb,
  input: {
    lead_id: string;
    subject?: string | null;
    body: string;
    personalization_fact_id?: string | null;
    model: string;
  },
): Draft {
  const draft = DraftSchema.parse({
    id: randomUUID(),
    lead_id: input.lead_id,
    subject: input.subject ?? null,
    body: input.body,
    personalization_fact_id: input.personalization_fact_id ?? null,
    model: input.model,
    created_at: new Date().toISOString(),
  });
  db.prepare(
    `INSERT INTO drafts (id, lead_id, subject, body, personalization_fact_id, model, created_at)
     VALUES (@id, @lead_id, @subject, @body, @personalization_fact_id, @model, @created_at)`,
  ).run(draft);
  return draft;
}

export function getDraftById(db: OutreachDb, draftId: string): Draft | null {
  const row = db.prepare("SELECT * FROM drafts WHERE id = ?").get(draftId);
  return row ? DraftSchema.parse(row) : null;
}

export function updateDraft(
  db: OutreachDb,
  draftId: string,
  patch: { subject?: string | null; body?: string },
): Draft {
  const existing = getDraftById(db, draftId);
  if (!existing) throw new Error(`Draft not found: ${draftId}`);
  const draft = DraftSchema.parse({
    ...existing,
    subject: patch.subject !== undefined ? patch.subject : existing.subject,
    body: patch.body !== undefined ? patch.body : existing.body,
  });
  db.prepare(
    `UPDATE drafts SET subject = @subject, body = @body WHERE id = @id`,
  ).run({ id: draft.id, subject: draft.subject, body: draft.body });
  return draft;
}

export function transitionLead(
  db: OutreachDb,
  leadId: string,
  toState: LeadState,
  meta: Record<string, unknown> = {},
): void {
  const row = db
    .prepare("SELECT state FROM leads WHERE id = ?")
    .get(leadId) as { state: string } | undefined;
  if (!row) throw new Error(`Lead not found: ${leadId}`);
  const from = LeadStateSchema.parse(row.state);
  assertTransition(from, toState);
  const at = new Date().toISOString();
  const run = db.transaction(() => {
    db.prepare("UPDATE leads SET state = ?, updated_at = ? WHERE id = ?").run(
      toState,
      at,
      leadId,
    );
    db.prepare(
      `INSERT INTO events (id, lead_id, from_state, to_state, meta, at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      leadId,
      from,
      toState,
      JSON.stringify(meta),
      at,
    );
  });
  run();
}

export function listLeadsByState(
  db: OutreachDb,
  state: LeadState,
  limit?: number,
): Lead[] {
  const parsedState = LeadStateSchema.parse(state);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 0)) {
    throw new Error(`Invalid lead limit: ${limit}`);
  }
  const rows =
    limit === undefined
      ? db
          .prepare(
            "SELECT * FROM leads WHERE state = ? ORDER BY updated_at, id",
          )
          .all(parsedState)
      : db
          .prepare(
            "SELECT * FROM leads WHERE state = ? ORDER BY updated_at, id LIMIT ?",
          )
          .all(parsedState, limit);
  return rows.map((row) => LeadSchema.parse(row));
}

export function updateLeadScore(
  db: OutreachDb,
  leadId: string,
  score: number,
): void {
  if (!Number.isInteger(score))
    throw new Error(`Lead score must be an integer: ${score}`);
  const result = db
    .prepare("UPDATE leads SET score = ?, updated_at = ? WHERE id = ?")
    .run(score, new Date().toISOString(), leadId);
  if (result.changes === 0) throw new Error(`Lead not found: ${leadId}`);
}
