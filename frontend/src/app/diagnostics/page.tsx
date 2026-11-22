"use client";

import { useState } from "react";
import Link from "next/link";
import { runDiagnostics, DiagnosticReport } from "@/lib/api";

function Check({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span>{label}</span>
      <span className={ok ? "text-green-500" : "text-red-500"}>{ok ? "OK" : "Failed"}</span>
    </div>
  );
}

export default function DiagnosticsPage() {
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    setError("");
    try {
      setReport(await runDiagnostics());
    } catch (e) {
      setReport(null);
      setError(e instanceof Error ? e.message : "Diagnostics sweep failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Diagnostics</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Probes Ollama, storage, and search providers. Probes can take several seconds.
          </p>
        </div>
        <button
          onClick={run}
          disabled={running}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50 shrink-0"
        >
          {running ? "Running…" : report ? "Run again" : "Run sweep"}
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {!report && !running && !error && (
        <div className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">
          No results yet. Click <span className="text-foreground">Run sweep</span> to check each dependency.
        </div>
      )}

      {running && <p className="text-sm text-muted-foreground animate-pulse">Running diagnostics…</p>}

      {report && (
        <>
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Overall</h2>
              <span className={`text-sm font-semibold ${report.status === "healthy" ? "text-green-500" : "text-amber-500"}`}>
                {report.status}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">{report.timestamp}</p>
          </div>

          <section className="rounded-lg border border-border bg-card p-5 space-y-2">
            <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-4">Checks</h2>
            <Check label="Ollama" ok={report.ollama_available} />
            <Check label="ChromaDB" ok={report.chroma_healthy} />
            <Check label="Tavily" ok={report.tavily_reachable} />
            <Check label="Serper" ok={report.serper_reachable} />
            <Check label="Firecrawl" ok={report.firecrawl_reachable} />
          </section>

          {report.errors.length > 0 && (
            <section className="rounded-lg border border-red-500/30 bg-card p-5">
              <h2 className="text-sm font-medium text-red-500 mb-2">Errors</h2>
              {report.errors.map((e, i) => <p key={i} className="text-xs text-muted-foreground mt-1">{e}</p>)}
            </section>
          )}

          {report.remediation.length > 0 && (
            <section className="rounded-lg border border-border bg-card p-5">
              <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-2">Suggested fixes</h2>
              {report.remediation.map((r, i) => <p key={i} className="text-xs text-muted-foreground mt-1">{r}</p>)}
            </section>
          )}

          {report.recent_errors.length > 0 && (
            <section className="rounded-lg border border-border bg-card p-5">
              <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-2">Recent errors</h2>
              {report.recent_errors.map((e, i) => (
                <p key={i} className="text-xs text-muted-foreground mt-1 font-mono break-all">{String(e)}</p>
              ))}
            </section>
          )}
        </>
      )}

      <p className="text-sm text-muted-foreground">
        For provider keys, see <Link href="/preferences" className="underline hover:text-foreground">Preferences</Link>.
      </p>
    </div>
  );
}
