"use client";

import { useEffect, useState } from "react";
import {
  fetchActivePursuits, fetchWonLost, fetchTracking,
  ActivePursuit, WonLostSummary, TrackingEvent,
} from "@/lib/api";

export default function TrackingPage() {
  const [pursuits, setPursuits] = useState<ActivePursuit[]>([]);
  const [summary, setSummary] = useState<WonLostSummary | null>(null);
  const [events, setEvents] = useState<TrackingEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      fetchActivePursuits().then((r) => setPursuits(r.active)).catch(() => {}),
      fetchWonLost().then(setSummary).catch(() => {}),
      fetchTracking(30).then((r) => setEvents(r.events)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground animate-pulse">Loading tracking data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tracking</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pursued leads, status transitions, and pipeline effectiveness.
        </p>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground uppercase">Won</p>
            <p className="text-xl font-semibold text-green-500 mt-1">{summary.won}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground uppercase">Lost</p>
            <p className="text-xl font-semibold text-red-500 mt-1">{summary.lost}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground uppercase">Active</p>
            <p className="text-xl font-semibold text-amber-500 mt-1">{summary.active_pursuits}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground uppercase">Win Rate</p>
            <p className="text-xl font-semibold mt-1">{summary.win_rate}%</p>
          </div>
        </div>
      )}

      {/* Active pursuits */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">
          Active Pursuits ({pursuits.length})
        </h2>
        {pursuits.length === 0 ? (
          <p className="text-sm text-muted-foreground">No leads in active pursuit.</p>
        ) : (
          <div className="space-y-2">
            {pursuits.map((p) => {
              const lead = p.lead;
              return (
                <div key={lead.id} className="rounded-lg border border-border bg-card p-3 hover:bg-accent/50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{lead.title}</p>
                      {lead.company && <p className="text-xs text-muted-foreground mt-0.5">{lead.company}</p>}
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                          lead.status === "PROPOSAL_SENT" ? "bg-green-500/20 text-green-400" :
                          lead.status === "REPLIED" ? "bg-amber-500/20 text-amber-400" :
                          "bg-blue-500/20 text-blue-400"
                        }`}>{lead.status}</span>
                        <span>{p.total_events} event{p.total_events !== 1 ? "s" : ""}</span>
                        {p.last_event && (
                          <span>Last: {new Date(p.last_event.at).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                    <a href={`/leads`} className="text-xs text-muted-foreground hover:text-foreground shrink-0">View →</a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Won/Lost by niche */}
      {summary && (summary.by_niche.won || summary.by_niche.lost) && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">By Niche</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-green-500 font-medium mb-1">Won</p>
              {Object.entries(summary.by_niche.won).length === 0
                ? <p className="text-muted-foreground">—</p>
                : Object.entries(summary.by_niche.won).map(([n, c]) => (
                    <p key={n} className="text-muted-foreground capitalize">{n.replace("_", " ")}: {c}</p>
                  ))
              }
            </div>
            <div>
              <p className="text-red-500 font-medium mb-1">Lost</p>
              {Object.entries(summary.by_niche.lost).length === 0
                ? <p className="text-muted-foreground">—</p>
                : Object.entries(summary.by_niche.lost).map(([n, c]) => (
                    <p key={n} className="text-muted-foreground capitalize">{n.replace("_", " ")}: {c}</p>
                  ))
              }
            </div>
          </div>
        </div>
      )}

      {/* Recent events timeline */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">
          Recent Events
        </h2>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tracking events yet.</p>
        ) : (
          <div className="space-y-1">
            {events.slice(0, 20).map((evt, i) => (
              <div key={i} className="flex items-center gap-3 text-xs text-muted-foreground py-1">
                <span className="shrink-0 w-20">{new Date(evt.at).toLocaleDateString()}</span>
                <span className="bg-card border border-border rounded px-1.5 py-0.5 text-[10px] font-medium uppercase">
                  {evt.type}
                </span>
                <span className="truncate">{evt.lead_id?.slice(0, 8)}...</span>
                {evt.data && typeof evt.data === "object" && "to_status" in evt.data && (
                  <span className="text-muted-foreground/70">
                    → {(evt.data as Record<string, string>).to_status}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
