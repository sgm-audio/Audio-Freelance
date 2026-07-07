"use client";

import { useEffect, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { fetchStatus, fetchMarket, fetchHealth, StatusResponse, MarketReport } from "@/lib/api";
import AudioVis from "@/components/audio-vis";

export default function Dashboard() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [market, setMarket] = useState<MarketReport | null>(null);
  const [health, setHealth] = useState<{ status: string; ollama: boolean } | null>(null);
  const [backendDown, setBackendDown] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      fetchStatus().then(setStatus).catch(() => {}),
      fetchHealth().then(setHealth).catch(() => {}),
      fetchMarket().then(setMarket).catch(() => {}),
    ]).then((results) => {
      const allFailed = results.every(r => r.status === "rejected");
      setBackendDown(allFailed);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground animate-pulse">Connecting to backend...</p>
      </div>
    );
  }

  if (backendDown) {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center">
        <div className="text-6xl mb-6 text-muted-foreground">◆</div>
        <h1 className="text-2xl font-semibold tracking-tight mb-3">Backend Not Running</h1>
        <p className="text-muted-foreground mb-6">
          Start the API server to see your leads, market intelligence, and opportunities.
        </p>
        <div className="text-left rounded-lg border border-border bg-card p-5 text-sm space-y-2">
          <p className="font-medium">Run both services:</p>
          <code className="block bg-muted rounded p-2 text-xs">
            ./run.sh
          </code>
          <p className="font-medium mt-4">Or start individually:</p>
          <code className="block bg-muted rounded p-2 text-xs">
            make backend<br />make frontend
          </code>
          <p className="text-muted-foreground mt-4">
            FastAPI on :8080 · Next.js on :3000
          </p>
        </div>
      </div>
    );
  }

  const counts = status?.lead_counts || {};
  const trends = market?.tech_trends || [];
  const pricing = market?.pricing_benchmarks || [];
  const opps = market?.hot_opportunities || [];

  const totalLeads = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
  const hotCount = counts.HOT ?? 0;
  const pursuingCount = (counts.CONTACTED ?? 0) + (counts.REPLIED ?? 0) + (counts.PROPOSAL_SENT ?? 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {health?.ollama ? "✓ Backend online" : "⚠ Ollama unavailable — dedup disabled"}
          <span className="mx-2">·</span>
          {market?.scanned_at
            ? `Last market scan: ${new Date(market.scanned_at).toLocaleDateString()}`
            : "Run a market scan to populate"}
        </p>
      </div>

      <AudioVis />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Leads" value={totalLeads} total={totalLeads} />
        <StatCard label="Hot" value={hotCount} total={totalLeads} color="text-red-500" />
        <StatCard label="Warm" value={counts.WARM ?? 0} total={totalLeads} color="text-amber-500" />
        <StatCard label="Pursuing" value={pursuingCount} total={totalLeads} color="text-blue-500" />
        <StatCard label="Contacted" value={(counts.CONTACTED ?? 0) + (counts.PROPOSAL_SENT ?? 0)} total={totalLeads} />
      </div>

      {(() => {
        const statusData = [
          { name: "Hot", value: hotCount, color: "#ef4444" },
          { name: "Warm", value: counts.WARM ?? 0, color: "#f59e0b" },
          { name: "Cold", value: counts.COLD ?? 0, color: "#3b82f6" },
          { name: "Contacted", value: pursuingCount, color: "#8b5cf6" },
          { name: "Won", value: counts.WON ?? 0, color: "#22c55e" },
        ].filter(d => d.value > 0);
        if (statusData.length === 0) return null;
        return (
          <div className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-sm font-medium text-muted-foreground mb-4 uppercase tracking-wider">Lead Status</h2>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3}>
                  {statusData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} stroke="none" />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        );
      })()}

      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">Quick Actions</h2>
        <div className="flex flex-wrap gap-2">
          {["plugin_dev", "reaper_scripts", "rust_audio", "audio_ml", "game_audio_dev"].map((niche) => (
            <a key={niche} href={`/prospect/${niche}`}
              className="inline-flex items-center rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-accent transition-colors"
            >
              Prospect {niche.replace("_", " ")}
            </a>
          ))}
          <a href="/market"
            className="inline-flex items-center rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-accent transition-colors"
          >
            Market Scan →
          </a>
          <a href="/opportunities"
            className="inline-flex items-center rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-accent transition-colors"
          >
            Opportunities →
          </a>
          <a href="/cold-leads"
            className="inline-flex items-center rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-accent transition-colors"
          >
            Cold Leads →
          </a>
          <a href="/tracking"
            className="inline-flex items-center rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-accent transition-colors"
          >
            Tracking →
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-medium text-muted-foreground mb-4 uppercase tracking-wider">Technology Trends</h2>
          {trends.length === 0 ? (
            <p className="text-sm text-muted-foreground">Run a <a href="/market" className="underline">market scan</a>.</p>
          ) : (
            <div className="space-y-2">
              {trends.slice(0, 8).map((t) => (
                <div key={t.technology} className="flex items-center justify-between text-sm">
                  <span>{t.technology}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{t.mentions}</span>
                    <span className={`text-xs ${t.direction === "rising" ? "text-green-500" : t.direction === "declining" ? "text-red-500" : "text-muted-foreground"}`}>
                      {t.direction === "rising" ? "↑" : t.direction === "declining" ? "↓" : "→"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-medium text-muted-foreground mb-4 uppercase tracking-wider">Pricing Benchmarks</h2>
          {pricing.length === 0 ? (
            <p className="text-sm text-muted-foreground">Run a <a href="/market" className="underline">market scan</a>.</p>
          ) : (
            <div className="space-y-2">
              {pricing.map((p) => (
                <div key={p.niche} className="text-sm">
                  <div className="flex items-center justify-between">
                    <span className="capitalize">{p.niche.replace("_", " ")}</span>
                    <span className="font-medium">${p.contract_range_min.toLocaleString()}–${p.contract_range_max.toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{p.sample_count} data points</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {opps.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-medium text-muted-foreground mb-4 uppercase tracking-wider">Opportunities</h2>
          <div className="space-y-2">
            {opps.slice(0, 5).map((o, i) => (
              <p key={i} className="text-sm">{o}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, total, color }: { label: string; value: number; total: number; color?: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${color ?? ""}`}>{value}</p>
      <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  );
}
