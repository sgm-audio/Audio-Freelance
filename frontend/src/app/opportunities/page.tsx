"use client";

import { useEffect, useState } from "react";
import { fetchMarketOpportunities, MarketSignal } from "@/lib/api";

export default function OpportunitiesPage() {
  const [data, setData] = useState<{
    summary: string; opportunities: string[]; recent_signals: MarketSignal[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try { setData(await fetchMarketOpportunities()); } catch { setData(null); }
    setLoading(false);
  }

  if (loading) return <p className="text-sm text-muted-foreground animate-pulse">Scanning for opportunities...</p>;
  if (!data) {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center">
        <h1 className="text-2xl font-semibold tracking-tight mb-3">Backend Not Running</h1>
        <p className="text-muted-foreground mb-4">Start the backend to view opportunities.</p>
        <code className="block bg-muted rounded p-2 text-xs text-left">
          ./run.sh<br />
          make backend<br />make frontend
        </code>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Opportunities</h1>
          <p className="text-sm text-muted-foreground mt-1">Actionable leads and market signals</p>
        </div>
        <button onClick={load} className="rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-accent">
          Refresh
        </button>
      </div>

      {/* Summary */}
      <div className="rounded-lg border border-border bg-card p-5">
        <p className="text-sm">{data.summary}</p>
      </div>

      {/* Opportunities */}
      <div>
        <h2 className="text-base font-medium mb-4">What to Pursue</h2>
        {data.opportunities.length === 0 ? (
          <p className="text-sm text-muted-foreground">No specific opportunities identified. Run a broader market scan.</p>
        ) : (
          <div className="space-y-3">
            {data.opportunities.map((o, i) => (
              <div key={i} className="rounded-lg border border-border bg-card p-4">
                <p className="text-sm">{o}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent signals */}
      <div>
        <h2 className="text-base font-medium mb-4">Recent Market Signals</h2>
        <div className="space-y-2">
          {data.recent_signals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No signals yet.</p>
          ) : (
            data.recent_signals.map((s, i) => (
              <div key={i} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs bg-accent text-accent-foreground rounded px-1.5 py-0.5">{s.category}</span>
                  <span className="text-xs text-muted-foreground">{s.source}</span>
                  {s.tags.map(t => (
                    <span key={t} className="text-xs text-muted-foreground">#{t}</span>
                  ))}
                </div>
                <p className="text-sm font-medium">{s.title}</p>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{s.snippet}</p>
                {s.url && (
                  <a href={s.url} target="_blank" className="text-xs text-blue-500 hover:underline mt-1 block">
                    Open source →
                  </a>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Saved drafts */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-medium mb-3">Saved Application Drafts</h2>
        <p className="text-xs text-muted-foreground mb-3">
          8 application drafts are saved in the project at <code className="text-foreground">outreach/READY_TO_SEND.md</code>
        </p>
        <div className="text-sm space-y-1">
          <p><span className="font-medium">Cash now:</span> VoiceWunder, BlackSalt Audio, RelicSoundLabs</p>
          <p><span className="font-medium">Apply this week:</span> Soundtoys, Music AI, Suno</p>
          <p><span className="font-medium">Check eligibility:</span> nadirozmen plugin series (remote, possible cofounder)</p>
        </div>
      </div>
    </div>
  );
}
