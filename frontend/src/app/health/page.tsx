"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchConfigStatus, fetchHealth, fetchStatus, ConfigStatus, HealthResponse, StatusResponse } from "@/lib/api";

export default function HealthPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [config, setConfig] = useState<ConfigStatus | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // State updates happen in the async callback, not synchronously in the
    // effect body (the React-recommended pattern for external data).
    Promise.allSettled([fetchHealth(), fetchStatus(), fetchConfigStatus()]).then((results) => {
      if (cancelled) return;
      if (results[0].status === "fulfilled") setHealth(results[0].value);
      if (results[1].status === "fulfilled") setStatus(results[1].value);
      if (results[2].status === "fulfilled") setConfig(results[2].value);
      if (results.every((r) => r.status === "rejected")) {
        setError("Backend is unreachable. Start it with `python run.py`.");
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return <p className="text-sm text-muted-foreground animate-pulse">Checking services…</p>;
  }

  const ok = health?.status === "ok";
  const providers = config
    ? [
        { name: "Tavily", ready: config.tavily },
        { name: "Serper", ready: config.serper },
        { name: "Firecrawl", ready: config.firecrawl },
      ]
    : [];

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">API Health</h1>
        <p className="text-sm text-muted-foreground mt-1">Live status of the backend and its dependencies</p>
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-5">
          <p className="text-xs text-muted-foreground uppercase">Backend</p>
          <p className={`text-lg font-semibold mt-1 ${ok ? "text-green-500" : "text-red-500"}`}>
            {ok ? "Online" : "Unavailable"}
          </p>
          {health?.timestamp && (
            <p className="text-xs text-muted-foreground mt-2">{health.timestamp}</p>
          )}
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <p className="text-xs text-muted-foreground uppercase">Ollama</p>
          <p className={`text-lg font-semibold mt-1 ${health?.ollama ? "text-green-500" : "text-amber-500"}`}>
            {health?.ollama ? "Reachable" : "Not detected"}
          </p>
          {status && (
            <p className="text-xs text-muted-foreground mt-2">
              {Object.values(status.lead_counts).reduce<number>((n, v) => n + (v || 0), 0)} leads stored
            </p>
          )}
        </div>
      </div>

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">Search providers</h2>
        <div className="space-y-2 text-sm">
          {providers.length > 0 ? providers.map((p) => (
            <div key={p.name} className="flex items-center justify-between">
              <span>{p.name}</span>
              <span className={p.ready ? "text-green-500" : "text-muted-foreground"}>
                {p.ready ? "Configured" : "Not set"}
              </span>
            </div>
          )) : (
            <p className="text-muted-foreground">Could not read provider status.</p>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-4">
          Add or change keys in <Link href="/preferences" className="underline hover:text-foreground">Preferences</Link>.
        </p>
      </section>

      <p className="text-sm text-muted-foreground">
        Need more detail? Run a full <Link href="/diagnostics" className="underline hover:text-foreground">diagnostics sweep</Link>.
      </p>
    </div>
  );
}
