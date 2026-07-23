/**
 * Staging dry-run mode (OUTREACH_BUILD_SPEC §7 M5 / §10):
 * - Forces SGM_OUTREACH_STAGING semantics: mock "sends" never leave the process.
 * - Seeds 10 fixture leads, walks NEW→…→SENT (or blocks on suppression).
 * - Proves suppressed addresses are fail-closed before any mock send.
 *
 * When packages/draft|approve|send land, this still works offline with mocks;
 * it does not require Resend or DeepSeek keys.
 */
import {
  addSuppression,
  ensureLead,
  insertContact,
  insertFact,
  isEmailSuppressed,
  openAndMigrate,
  setPaused,
  transitionLead,
  upsertCompany,
  type OutreachDb,
} from "@sgm-outreach/core";

export interface DryRunLeadResult {
  company: string;
  email: string;
  segment: string;
  sent: boolean;
  blocked_reason: string | null;
  final_state: string;
}

export interface DryRunReport {
  staging: true;
  paused_blocks_send: boolean;
  leads: DryRunLeadResult[];
  sent_count: number;
  blocked_count: number;
  summary_table: string;
}

const FIXTURES: Array<{
  name: string;
  domain: string;
  segment: string;
  email: string;
  fact: string;
}> = [
  {
    name: "Aurora Plugins",
    domain: "aurora-plugins.example",
    segment: "music-tech",
    email: "founder@aurora-plugins.example",
    fact: "Shipping AU/VST3 synths on their site",
  },
  {
    name: "Cascade DSP",
    domain: "cascade-dsp.example",
    segment: "music-tech",
    email: "eng@cascade-dsp.example",
    fact: "Hiring for real-time audio C++",
  },
  {
    name: "Northwind Audio",
    domain: "northwind-audio.example",
    segment: "studio",
    email: "owner@northwind-audio.example",
    fact: "Boutique mastering studio in Vancouver",
  },
  {
    name: "Pulseware Labs",
    domain: "pulseware.example",
    segment: "music-tech",
    email: "ceo@pulseware.example",
    fact: "iOS AUv3 catalog listed on App Store",
  },
  {
    name: "Reed Instruments",
    domain: "reed-instruments.example",
    segment: "hardware",
    email: "product@reed-instruments.example",
    fact: "Eurorack module firmware page updated",
  },
  {
    name: "Silk Road Sound",
    domain: "silkroadsound.example",
    segment: "studio",
    email: "bookings@silkroadsound.example",
    fact: "Podcast post suite advertised",
  },
  {
    name: "Tideform Soft",
    domain: "tideform.example",
    segment: "music-tech",
    email: "hello@tideform.example",
    fact: "CLAP plugin SDK mentioned in docs",
  },
  {
    name: "Umbra Games Audio",
    domain: "umbra-audio.example",
    segment: "games",
    email: "audio@umbra-audio.example",
    fact: "Middleware integrator role posted",
  },
  {
    name: "Volt Meter Music",
    domain: "voltmeter.example",
    segment: "label",
    email: "aandr@voltmeter.example",
    fact: "Independent label seeking mastering",
  },
  {
    name: "Suppressed Sink Co",
    domain: "suppressed-sink.example",
    segment: "music-tech",
    email: "blocked@suppressed-sink.example",
    fact: "Used only to prove suppression gate",
  },
];

const PIPELINE: Array<
  | "ENRICHED"
  | "SCORED"
  | "DRAFTED"
  | "PENDING_APPROVAL"
  | "APPROVED"
> = ["ENRICHED", "SCORED", "DRAFTED", "PENDING_APPROVAL", "APPROVED"];

function advanceToApproved(db: OutreachDb, leadId: string): void {
  for (const state of PIPELINE) {
    transitionLead(db, leadId, state, { source: "dry-run" });
  }
}

/** Mock send gate: pause + suppression fail closed; otherwise SENT. */
export function mockSendApproved(
  db: OutreachDb,
  leadId: string,
  email: string,
  paused: boolean,
): { sent: boolean; blocked_reason: string | null } {
  if (paused) {
    return { sent: false, blocked_reason: "paused" };
  }
  if (isEmailSuppressed(db, email)) {
    return { sent: false, blocked_reason: "suppressed" };
  }
  // Staging sink: we still record SENT; destination would be sink in real send.
  transitionLead(db, leadId, "SENT", {
    source: "dry-run",
    staging: true,
    to: process.env["SGM_OUTREACH_SINK_EMAIL"] ?? "sink@staging.local",
  });
  return { sent: true, blocked_reason: null };
}

export function runDryRun(dbPath: string): DryRunReport {
  const prevStaging = process.env["SGM_OUTREACH_STAGING"];
  process.env["SGM_OUTREACH_STAGING"] = "1";

  const db = openAndMigrate(dbPath);
  try {
    setPaused(db, false);
    // Prove suppression blocks the designated address.
    addSuppression(db, "blocked@suppressed-sink.example", "dry-run-fixture");

    const results: DryRunLeadResult[] = [];

    for (const fx of FIXTURES) {
      const { company } = upsertCompany(db, {
        name: fx.name,
        domain: fx.domain,
        segment: fx.segment,
        tier: 1,
        source: "dry-run",
      });
      const contact = insertContact(db, {
        company_id: company.id,
        name: `${fx.name} Contact`,
        role: "Founder",
        email: fx.email,
        email_source: "fixture",
      });
      insertFact(db, {
        company_id: company.id,
        fact: fx.fact,
        evidence_url: `https://${fx.domain}/about`,
      });
      const { lead } = ensureLead(db, {
        company_id: company.id,
        contact_id: contact.id,
        channel: "email",
      });
      advanceToApproved(db, lead.id);
      const paused = false;
      const send = mockSendApproved(db, lead.id, fx.email, paused);
      const final = db
        .prepare("SELECT state FROM leads WHERE id = ?")
        .get(lead.id) as { state: string };
      results.push({
        company: fx.name,
        email: fx.email,
        segment: fx.segment,
        sent: send.sent,
        blocked_reason: send.blocked_reason,
        final_state: final.state,
      });
    }

    // Pause kill-switch self-check (does not mutate fixture leads).
    const pauseProbe = mockSendApproved(
      db,
      "00000000-0000-0000-0000-000000000000",
      "pause-probe@example.com",
      true,
    );

    const sent_count = results.filter((r) => r.sent).length;
    const blocked_count = results.filter((r) => !r.sent).length;
    const summary_table = formatDryRunTable(results);

    return {
      staging: true,
      paused_blocks_send: pauseProbe.blocked_reason === "paused",
      leads: results,
      sent_count,
      blocked_count,
      summary_table,
    };
  } finally {
    db.close();
    if (prevStaging === undefined) {
      delete process.env["SGM_OUTREACH_STAGING"];
    } else {
      process.env["SGM_OUTREACH_STAGING"] = prevStaging;
    }
  }
}

export function formatDryRunTable(rows: DryRunLeadResult[]): string {
  const lines = [
    "company                  email                                  result",
    "----------------------  ------------------------------------  --------",
  ];
  for (const r of rows) {
    const result = r.sent
      ? `SENT (${r.final_state})`
      : `BLOCKED:${r.blocked_reason}`;
    lines.push(
      `${r.company.padEnd(22)}  ${r.email.padEnd(36)}  ${result}`,
    );
  }
  return lines.join("\n");
}

/** Assert invariants — throws if dry-run is not proud. */
export function assertDryRunOk(report: DryRunReport): void {
  if (report.leads.length !== 10) {
    throw new Error(`expected 10 leads, got ${report.leads.length}`);
  }
  const blocked = report.leads.find((l) =>
    l.email.toLowerCase() === "blocked@suppressed-sink.example",
  );
  if (!blocked || blocked.sent || blocked.blocked_reason !== "suppressed") {
    throw new Error("suppressed address was not blocked");
  }
  if (report.sent_count !== 9) {
    throw new Error(`expected 9 sends, got ${report.sent_count}`);
  }
  if (!report.paused_blocks_send) {
    throw new Error("pause kill switch did not block mock send");
  }
  if (!report.staging) {
    throw new Error("dry-run must run in staging mode");
  }
}
