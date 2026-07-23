/** Versioned SQL migrations (embedded — no separate asset copy step). */
export const MIGRATIONS: ReadonlyArray<{ version: number; sql: string }> = [
    {
        version: 1,
        sql: `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  domain TEXT NOT NULL UNIQUE,
  tier INTEGER NOT NULL DEFAULT 0,
  segment TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY NOT NULL,
  company_id TEXT NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  role TEXT,
  email TEXT,
  linkedin_url TEXT,
  email_source TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS contacts_email_unique
  ON contacts(email) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS facts (
  id TEXT PRIMARY KEY NOT NULL,
  company_id TEXT NOT NULL REFERENCES companies(id),
  fact TEXT NOT NULL,
  evidence_url TEXT NOT NULL,
  extracted_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY NOT NULL,
  company_id TEXT NOT NULL REFERENCES companies(id),
  contact_id TEXT REFERENCES contacts(id),
  channel TEXT NOT NULL,
  state TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  UNIQUE (contact_id, channel)
);

CREATE TABLE IF NOT EXISTS drafts (
  id TEXT PRIMARY KEY NOT NULL,
  lead_id TEXT NOT NULL REFERENCES leads(id),
  subject TEXT,
  body TEXT NOT NULL,
  personalization_fact_id TEXT REFERENCES facts(id),
  model TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY NOT NULL,
  lead_id TEXT NOT NULL REFERENCES leads(id),
  from_state TEXT,
  to_state TEXT NOT NULL,
  meta TEXT NOT NULL DEFAULT '{}',
  at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS events_lead_id_at ON events(lead_id, at);

CREATE TABLE IF NOT EXISTS suppressions (
  email TEXT PRIMARY KEY NOT NULL,
  reason TEXT NOT NULL,
  at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
`,
    },
];
//# sourceMappingURL=migrations.js.map