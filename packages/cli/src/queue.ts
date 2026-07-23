import {
  getCompanyById,
  getContactById,
  getLatestDraftForLead,
  listLeadsByState,
  openAndMigrate,
  type Channel,
  type LeadState,
} from "@sgm-outreach/core";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { defaultDbPath } from "./status.js";

function parseFlag(argv: string[], name: string): string | undefined {
  const idx = argv.indexOf(name);
  if (idx < 0) return undefined;
  return argv[idx + 1];
}

/**
 * Paste-only queues — NO LinkedIn auto-send, NO Sales Nav scrape.
 * `sgm-outreach queue linkedin|upwork`
 */
export function runQueueCommand(argv: string[]): void {
  const channelRaw = argv[3];
  if (channelRaw !== "linkedin" && channelRaw !== "upwork") {
    throw new Error("Usage: sgm-outreach queue linkedin|upwork [--db path]");
  }
  const channel = channelRaw as Channel;
  const dbPath = parseFlag(argv, "--db") ?? defaultDbPath();
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = openAndMigrate(dbPath);
  try {
    const states: LeadState[] = ["APPROVED", "PENDING_APPROVAL"];
    const lines: string[] = [
      `SGM Outreach — ${channel} paste queue (manual send only)`,
      "HARD CONSTRAINT: no auto-send / no SN scrape",
      "",
    ];
    let n = 0;
    for (const state of states) {
      for (const lead of listLeadsByState(db, state)) {
        if (lead.channel !== channel) continue;
        const draft = getLatestDraftForLead(db, lead.id);
        if (!draft) continue;
        const company = getCompanyById(db, lead.company_id);
        const contact = lead.contact_id
          ? getContactById(db, lead.contact_id)
          : null;
        n += 1;
        lines.push(`--- #${n} [${state}] lead=${lead.id}`);
        lines.push(`company: ${company?.name ?? "?"}`);
        if (contact?.name) lines.push(`contact: ${contact.name}`);
        if (channel === "linkedin" && contact?.linkedin_url) {
          lines.push(`deep_link: ${contact.linkedin_url}`);
        }
        if (draft.subject) lines.push(`subject: ${draft.subject}`);
        lines.push("PASTE:");
        lines.push(draft.body);
        lines.push("");
      }
    }
    if (n === 0) lines.push("(empty queue)");
    console.log(lines.join("\n"));
  } finally {
    db.close();
  }
}
