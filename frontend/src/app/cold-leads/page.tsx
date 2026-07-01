"use client";

import { useEffect, useState } from "react";
import { fetchColdLeads, fetchColdStats, rotateColdLeads, Lead, ColdStats } from "@/lib/api";

export default function ColdLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState<ColdStats | null>(null);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [rotating, setRotating] = useState(false);
  const [rotateResult, setRotateResult] = useState<string>("");

  useEffect(() => { load(); }, [days]);

  async function load() {
    setLoading(true);
    try {
      const [data, s] = await Promise.all([
        fetchColdLeads(days),
        fetchColdStats(),
      ]);
      setLeads(data.leads);
      setStats(s);
    } catch { setLeads([]); }
    setLoading(false);
  }

  async function handleRotate() {
    setRotating(true);
    setRotateResult("");
    try {
      const result = await rotateColdLeads(3);
      setRotateResult(`Archived ${result.archived}, removed ${result.deleted} from active store.`);
      await load(); // refresh after rotation
    } catch {
      setRotateResult("Rotation failed — is the backend running?");
    }
    setRotating(false);
    // Clear the result message after 6s
    setTimeout(() => setRotateResult(""), 6000);
  }

  const bySource = stats?.by_source || {};
  const byNiche = stats?.by_niche || {};

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cold Leads</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {stats ? `${stats.total_archived} archived · ${leads.length} in range` : "Loading..."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRotate}
            disabled={rotating}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50 transition-colors"
          >
            {rotating ? "Rotating..." : "Rotate Now"}
          </button>
          {[3, 7, 14, 30].map((d) => (
            <button key={d} onClick={() => setDays(d)}
              className={`rounded-md px-3 py-1 text-xs ${days === d ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:bg-accent"}`}
            >{d}d</button>
          ))}
        </div>
      </div>

      {rotateResult && (
        <div className={`rounded-md border px-4 py-2 text-sm ${
          rotateResult.includes("failed") ? "border-red-500/30 bg-red-500/10 text-red-400" : "border-green-500/30 bg-green-500/10 text-green-400"
        }`}>
          {rotateResult}
        </div>
      )}

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground uppercase">Archived</p>
            <p className="text-xl font-semibold mt-1">{stats.total_archived}</p>
          </div>
          {Object.entries(byNiche).slice(0, 3).map(([n, c]) => (
            <div key={n} className="rounded-lg border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground uppercase capitalize">{n.replace("_", " ")}</p>
              <p className="text-xl font-semibold mt-1">{c}</p>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground animate-pulse">Loading...</p>
      ) : leads.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-2">No cold leads in the last {days} days.</p>
          <p className="text-xs text-muted-foreground">
            Leads that are &ge;3 days old and scored COLD or WARM will appear here after rotation.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {leads.map((lead) => (
            <div key={lead.id} className="rounded-lg border border-border bg-card p-3 hover:bg-accent/50">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-gray-500" />
                    <span className="font-medium text-sm truncate">{lead.title}</span>
                    <span className="text-xs text-muted-foreground shrink-0">T{lead.tier}</span>
                  </div>
                  {lead.company && <p className="text-xs text-muted-foreground mt-0.5">{lead.company}</p>}
                  <p className="text-xs text-muted-foreground mt-1 truncate">{lead.raw_text?.slice(0, 150)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm text-muted-foreground">{lead.score}</p>
                  <p className="text-xs text-muted-foreground capitalize">{lead.niche?.replace("_", " ")}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                <a href={lead.url} target="_blank" className="hover:text-foreground">Open →</a>
                <span>Source: {lead.source}</span>
                {lead.discovered_at && (
                  <span>{new Date(lead.discovered_at).toLocaleDateString()}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
