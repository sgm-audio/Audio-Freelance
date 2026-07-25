"use client";

import { useEffect, useState } from "react";
import { fetchHealth, fetchMarketOpportunities, MarketSignal } from "@/lib/api";

type LoadError =
  | { kind: "backend_down" }
  | { kind: "timeout" }
  | { kind: "http"; message: string }
  | { kind: "other"; message: string };

function classifyFetchError(err: unknown): LoadError {
  const msg = err instanceof Error ? err.message : String(err);
  if (err instanceof Error && err.name === "AbortError") {
    return { kind: "timeout" };
  }
  if (/\b5\d{2}\b/.test(msg)) {
    return { kind: "http", message: msg };
  }
  return { kind: "other", message: msg || "Could not load opportunities" };
}

export default function OpportunitiesPage() {
  const [data, setData] = useState<{
    summary: string; opportunities: string[]; recent_signals: MarketSignal[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<LoadError | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      try {
        await fetchHealth();
      } catch {
        setData(null);
        setError({ kind: "backend_down" });
        setLoading(false);
        return;
      }
      setData(await fetchMarketOpportunities());
    } catch (e) {
      setData(null);
      setError(classifyFetchError(e));
    }
    setLoading(false);
  }

  if (loading) return <p className="text-sm text-muted-foreground animate-pulse">Scanning for opportunities...</p>;

  if (error?.kind === "backend_down") {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center">
        <h1 className="text-2xl font-semibold tracking-tight mb-3">Backend Not Running</h1>
        <p className="text-muted-foreground mb-4">Start the API, then refresh this page.</p>
        <code className="block bg-muted rounded p-2 text-xs text-left">python run.py</code>
      </div>
    );
  }

  if (error || !data) {
    const title =
      error?.kind === "timeout" ? "Opportunities timed out" :
      error?.kind === "http" ? "Opportunities request failed" :
      "No opportunity data";
    const detail =
      error?.kind === "timeout"
        ? "The market opportunities call timed out. Retry, or check search API keys in .env."
        : error?.kind === "http"
          ? `Server error: ${error.message}. Check backend logs.`
          : "Backend is reachable, but this scan returned nothing. Web search needs Tavily, Serper, or Firecrawl keys; ATS company lists still work without them.";
    return (
      <div className="max-w-lg mx-auto mt-16 space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight text-center">{title}</h1>
        <p className="text-sm text-muted-foreground text-center">{detail}</p>
        <div className="flex justify-center">
          <button onClick={load} className="rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-accent">
            Retry
          </button>
        </div>
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

      <div className="rounded-lg border border-border bg-card p-5">
        <p className="text-sm">{data.summary}</p>
      </div>

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
    </div>
  );
}
