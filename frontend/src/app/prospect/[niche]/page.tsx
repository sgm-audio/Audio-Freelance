"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { prospectNiche, ProspectResult } from "@/lib/api";

function looksLikeMissingSearchKeys(errors: string[]): boolean {
  const blob = errors.join(" ").toLowerCase();
  return (
    /tavily|serper|firecrawl|api[_ ]?key|no search|missing.*key|unauthorized|401|403/.test(blob) ||
    errors.length === 0
  );
}

export default function ProspectPage() {
  const params = useParams();
  const niche = params.niche as string;
  const [result, setResult] = useState<ProspectResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ran, setRan] = useState(false);

  async function runScan() {
    setLoading(true);
    setError("");
    setRan(true);
    try {
      setResult(await prospectNiche(niche));
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const allLeads = [...(result?.hot_leads || []), ...(result?.warm_leads || [])];
  const showKeysBanner =
    ran &&
    !loading &&
    result &&
    result.total_candidates === 0 &&
    allLeads.length === 0 &&
    looksLikeMissingSearchKeys(result.errors);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight capitalize">{niche.replace("_", " ")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {ran ? "Prospect scan results" : "Ready when you are — scans hit web search + ATS and can take a minute."}
          </p>
        </div>
        <button
          onClick={runScan}
          disabled={loading}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50 shrink-0"
        >
          {loading ? "Scanning…" : ran ? "Run again" : "Run scan"}
        </button>
      </div>

      {!ran && !loading && (
        <div className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground space-y-2">
          <p>This does not start automatically. Click <span className="text-foreground">Run scan</span> when you want fresh candidates.</p>
          <p>
            Web search needs at least one of <code className="text-foreground">TAVILY_API_KEY</code>,{" "}
            <code className="text-foreground">SERPER_API_KEY</code>, or{" "}
            <code className="text-foreground">FIRECRAWL_API_KEY</code> in <code className="text-foreground">.env</code>.
            ATS boards (Greenhouse / Lever / Ashby company lists) still run without those keys.
          </p>
        </div>
      )}

      {loading && <p className="text-sm text-muted-foreground animate-pulse">Scanning…</p>}
      {error && <p className="text-sm text-red-500">Error: {error}</p>}

      {showKeysBanner && (
        <div className="rounded-lg border border-amber-500/40 bg-card p-4 text-sm space-y-1">
          <p className="font-medium text-amber-600 dark:text-amber-400">Empty scan — check search keys</p>
          <p className="text-muted-foreground">
            No candidates came back. If you have no Tavily / Serper / Firecrawl key, web tiers will be empty;
            ATS company lists in Preferences still work. Add a key to <code className="text-foreground">.env</code> and run again.
          </p>
        </div>
      )}

      {result && (
        <>
          <div className="grid grid-cols-4 gap-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground uppercase">Candidates</p>
              <p className="text-2xl font-semibold mt-1">{result.total_candidates}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground uppercase">Hot</p>
              <p className="text-2xl font-semibold mt-1 text-red-500">{result.hot}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground uppercase">Warm</p>
              <p className="text-2xl font-semibold mt-1 text-amber-500">{result.warm}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground uppercase">Errors</p>
              <p className="text-2xl font-semibold mt-1">{result.errors.length}</p>
            </div>
          </div>

          {result.errors.length > 0 && (
            <div className="rounded-lg border border-red-500/30 bg-card p-4">
              <p className="text-sm font-medium text-red-500">Errors</p>
              {result.errors.map((e, i) => <p key={i} className="text-xs text-muted-foreground mt-1">{e}</p>)}
            </div>
          )}

          {allLeads.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hot or warm leads found for this niche.</p>
          ) : (
            <div className="space-y-2">
              <h2 className="text-base font-medium">Hot & Warm Leads</h2>
              {allLeads.map((lead) => (
                <div key={lead.id} className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`inline-block w-2 h-2 rounded-full ${lead.verdict === "HOT" ? "bg-red-500" : "bg-amber-500"}`} />
                        <span className="font-medium">{lead.title}</span>
                      </div>
                      {lead.company && <p className="text-sm text-muted-foreground mt-0.5">{lead.company}</p>}
                      <p className="text-xs text-muted-foreground mt-1">{lead.raw_text.slice(0, 200)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-lg font-semibold ${lead.verdict === "HOT" ? "text-red-500" : "text-amber-500"}`}>
                        {lead.score}
                      </p>
                      <p className="text-xs text-muted-foreground">{lead.source}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex gap-2 text-xs">
                    <a href={lead.url} target="_blank" className="text-blue-500 hover:underline">Open →</a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
