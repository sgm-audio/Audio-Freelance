import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ensureLead,
  insertContact,
  insertFact,
  openAndMigrate,
  transitionLead,
  upsertCompany,
} from "@sgm-outreach/core";
import { afterEach, describe, expect, it } from "vitest";
import { runScore } from "../src/run.js";

const dirs: string[] = [];

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function tempDb(): ReturnType<typeof openAndMigrate> {
  const dir = mkdtempSync(join(tmpdir(), "sgm-score-"));
  dirs.push(dir);
  return openAndMigrate(join(dir, "test.sqlite"));
}

describe("runScore", () => {
  it("scores ENRICHED leads, transitions them, and skips them on rerun", () => {
    const db = tempDb();
    const company = upsertCompany(db, {
      name: "Signal Audio",
      domain: "signal.example",
      segment: "plugin",
      source: "manual",
    }).company;
    const contact = insertContact(db, {
      company_id: company.id,
      name: "Lin Engineer",
      role: "Audio Developer",
      email: "lin@signal.example",
    });
    insertFact(db, {
      company_id: company.id,
      fact: "A team of 8 maintains an active GitHub repo.",
      evidence_url: "https://signal.example/blog",
    });
    insertFact(db, {
      company_id: company.id,
      fact: "They are seeking a contractor for DSP work.",
      evidence_url: "https://signal.example/jobs",
    });
    const highLead = ensureLead(db, {
      company_id: company.id,
      contact_id: contact.id,
      channel: "email",
    }).lead;
    transitionLead(db, highLead.id, "ENRICHED");

    const lowCompany = upsertCompany(db, {
      name: "Unknown Co",
      domain: "unknown.example",
      segment: "other",
      source: "manual",
    }).company;
    const lowLead = ensureLead(db, {
      company_id: lowCompany.id,
      channel: "linkedin",
    }).lead;
    transitionLead(db, lowLead.id, "ENRICHED");

    const result = runScore({ db, limit: 10 });
    expect(result.scored).toHaveLength(2);

    const rows = db
      .prepare("SELECT id, state, score FROM leads ORDER BY id")
      .all() as Array<{ id: string; state: string; score: number }>;
    expect(rows.find((row) => row.id === highLead.id)).toMatchObject({
      state: "SCORED",
      score: 100,
    });
    expect(rows.find((row) => row.id === lowLead.id)).toMatchObject({
      state: "SCORED",
      score: -50,
    });

    const scoredEvent = db
      .prepare("SELECT meta FROM events WHERE lead_id = ? AND to_state = 'SCORED'")
      .get(highLead.id) as { meta: string };
    expect(JSON.parse(scoredEvent.meta)).toMatchObject({
      breakdown: {
        segment_match: 30,
        small_team: 20,
        shipping_evidence: 20,
        technical_contact: 15,
        hiring_signal: 15,
        no_contact_path: 0,
      },
    });

    expect(runScore({ db, limit: 10 }).scored).toEqual([]);
    db.close();
  });
});
