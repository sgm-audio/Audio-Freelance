"use client";

import { loadOutreachSnapshot, type OutreachSnapshot } from "@/lib/outreach-db";
import { OutreachConsole } from "./outreach-console";
import { Syne, IBM_Plex_Mono } from "next/font/google";
import { useEffect, useState } from "react";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-sgm-display",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sgm-mono",
  display: "swap",
});


export default function OutreachClient() {
  const [snapshot, setSnapshot] = useState<OutreachSnapshot | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadOutreachSnapshot()
      .then(snap => {
        setSnapshot(snap);
        setLoading(false);
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : "Failed to load outreach data");
        setLoading(false);
      });
  }, []);

  if (loading) {
    // Return empty snapshot while loading
    const emptySnapshot: OutreachSnapshot = {
      lead_counts: {
        NEW: 0, HOT: 0, WARM: 0, COLD: 0,
        CONTACTED: 0, REPLIED: 0, PROPOSAL_SENT: 0,
        SKIPPED: 0, WON: 0, LOST: 0, DEAD: 0,
        PENDING_APPROVAL: 0, SENT: 0,
      },
      funnel: [],
      ollama_available: false,
      paused: false,
      source: "loading",
      db_exists: false,
      totals: { leads: 0, companies: 0, contacts: 0, drafts: 0, suppressions: 0 },
      generated_at: new Date().toISOString(),
      pending_approval: [],
      linkedin_paste_queue: [],
      linkedin_warming: [],
      db_path: "",
      timestamp: new Date().toISOString(),
    };
    return (
      <div className={`${syne.variable} ${plexMono.variable} sgm-outreach`}>
        <OutreachConsole initial={emptySnapshot} />
      </div>
    );
  }

  if (error) {
    // Return empty snapshot on error
    const emptySnapshot: OutreachSnapshot = {
      lead_counts: {
        NEW: 0, HOT: 0, WARM: 0, COLD: 0,
        CONTACTED: 0, REPLIED: 0, PROPOSAL_SENT: 0,
        SKIPPED: 0, WON: 0, LOST: 0, DEAD: 0,
        PENDING_APPROVAL: 0, SENT: 0,
      },
      funnel: [],
      ollama_available: false,
      paused: false,
      source: "error",
      db_exists: false,
      totals: { leads: 0, companies: 0, contacts: 0, drafts: 0, suppressions: 0 },
      generated_at: new Date().toISOString(),
      pending_approval: [],
      linkedin_paste_queue: [],
      linkedin_warming: [],
      db_path: "",
      timestamp: new Date().toISOString(),
    };
    return (
      <div className={`${syne.variable} ${plexMono.variable} sgm-outreach`}>
        <OutreachConsole initial={emptySnapshot} />
      </div>
    );
  }

  return (
    <div className={`${syne.variable} ${plexMono.variable} sgm-outreach`}>
      {snapshot ? (
        <OutreachConsole initial={snapshot} />
      ) : (
        // Fallback empty snapshot (shouldn't happen in normal flow)
        <OutreachConsole initial={
          {
            lead_counts: {
              NEW: 0, HOT: 0, WARM: 0, COLD: 0,
              CONTACTED: 0, REPLIED: 0, PROPOSAL_SENT: 0,
              SKIPPED: 0, WON: 0, LOST: 0, DEAD: 0,
              PENDING_APPROVAL: 0, SENT: 0,
            },
            funnel: [],
            ollama_available: false,
            paused: false,
            source: "fallback",
            db_exists: false,
            totals: { leads: 0, companies: 0, contacts: 0, drafts: 0, suppressions: 0 },
            generated_at: new Date().toISOString(),
            pending_approval: [],
            linkedin_paste_queue: [],
            linkedin_warming: [],
            db_path: "",
            timestamp: new Date().toISOString(),
          }
        } />
      )}
    </div>
  );
}