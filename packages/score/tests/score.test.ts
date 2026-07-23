import type { Company, Contact, Fact } from "@sgm-outreach/core";
import { describe, expect, it } from "vitest";
import { meetsScoreThreshold, scoreLeadInput } from "../src/score.js";
import { parseSignalsFromFacts } from "../src/signals.js";

const company: Company = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Acme",
  domain: "acme.example",
  tier: 0,
  segment: "other",
  source: "manual",
  created_at: "2026-07-21T12:00:00.000Z",
};

const technicalContact: Contact = {
  id: "22222222-2222-4222-8222-222222222222",
  company_id: company.id,
  name: "Ada Dev",
  role: "DSP Engineer",
  email: null,
  linkedin_url: null,
  email_source: null,
};

const fact = (text: string): Fact => ({
  id: "33333333-3333-4333-8333-333333333333",
  company_id: company.id,
  fact: text,
  evidence_url: "https://acme.example/evidence",
  extracted_at: "2026-07-21T12:00:00.000Z",
});

describe("scoreLeadInput", () => {
  it("applies every positive weight", () => {
    const result = scoreLeadInput({
      company: { ...company, segment: "iOS audio" },
      contacts: [technicalContact],
      facts: [],
      signals: {
        teamSize: 15,
        shipping: true,
        hiring: true,
      },
    });

    expect(result.score).toBe(100);
    expect(result.breakdown).toEqual({
      segment_match: 30,
      small_team: 20,
      shipping_evidence: 20,
      technical_contact: 15,
      hiring_signal: 15,
      no_contact_path: 0,
    });
  });

  it("applies the no-contact penalty", () => {
    expect(
      scoreLeadInput({
        company,
        contacts: [],
        facts: [],
      }),
    ).toEqual({
      score: -50,
      breakdown: {
        segment_match: 0,
        small_team: 0,
        shipping_evidence: 0,
        technical_contact: 0,
        hiring_signal: 0,
        no_contact_path: -50,
      },
    });
  });

  it("treats an email as both technical-contact evidence and a contact path", () => {
    const result = scoreLeadInput({
      company,
      contacts: [{ ...technicalContact, role: null, email: "hello@acme.example" }],
      facts: [],
    });
    expect(result.breakdown.technical_contact).toBe(15);
    expect(result.breakdown.no_contact_path).toBe(0);
  });
});

describe("fact signal parsing", () => {
  it("extracts team, shipping, hiring, and segment hints", () => {
    const signals = parseSignalsFromFacts([
      fact("This 12-person team builds an AUv3 synth plugin."),
      fact("The company has an active GitHub repo and is hiring a DSP engineer."),
    ]);
    expect(signals).toEqual({
      segmentMatch: true,
      shipping: true,
      hiring: true,
      teamSize: 12,
    });
  });

  it("uses the upper bound of a team-size range", () => {
    expect(parseSignalsFromFacts(["Company size: 11-50 employees"]).teamSize).toBe(50);
  });
});

describe("draft threshold", () => {
  it("rejects 59 and accepts 60", () => {
    expect(meetsScoreThreshold(59)).toBe(false);
    expect(meetsScoreThreshold(60)).toBe(true);
  });
});
