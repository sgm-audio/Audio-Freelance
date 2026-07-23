"use client";

import { useCallback, useEffect, useState } from "react";
import {
  LeadDetailSheet,
  SignalChips,
  verdictDot,
} from "@/components/lead-detail-sheet";
import {
  addBlockedCompany,
  clearFetchCache,
  fetchBlockedCompanies,
  fetchLeads,
  Lead,
  updateLeadStatus,
} from "@/lib/api";

const STATUSES = [
  "NEW", "HOT", "WARM", "COLD", "SKIPPED", "CONTACTED",
  "PROPOSAL_SENT", "WON", "LOST", "DEAD",
];

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState<string[]>([]);
  const [blockMsg, setBlockMsg] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [focusIdx, setFocusIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      clearFetchCache();
      const [data, b] = await Promise.all([
        fetchLeads(filter || undefined),
        fetchBlockedCompanies(),
      ]);
      setLeads(data.leads);
      setBlocked(b.blocked_companies || []);
      setFocusIdx((i) => (data.leads.length ? Math.min(i, data.leads.length - 1) : 0));
    } catch (e: unknown) {
      const err = e as { name?: string };
      if (err.name === "AbortError") setError("Backend not responding.");
      else setError("Could not load leads. Backend may be down.");
      setLeads([]);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const selected = selectedId ? leads.find((l) => l.id === selectedId) ?? null : null;

  function openLead(lead: Lead, idx: number) {
    setSelectedId(lead.id);
    setFocusIdx(idx);
    setSheetOpen(true);
  }

  async function handleBlock(name: string) {
    try {
      await addBlockedCompany(name);
      setBlocked([...blocked, name.toLowerCase()]);
      setBlockMsg(`"${name}" blocked`);
    } catch {
      setBlockMsg("Failed to block company");
    }
    setTimeout(() => setBlockMsg(""), 3000);
  }

  const handleStatus = useCallback(async (status: string) => {
    if (!selectedId) return;
    setBusy(true);
    try {
      await updateLeadStatus(selectedId, status);
      setLeads((prev) =>
        prev.map((l) => (l.id === selectedId ? { ...l, status } : l)),
      );
      setStatusMsg(`→ ${status}`);
      setTimeout(() => setStatusMsg(""), 2000);
    } catch {
      setStatusMsg("Status update failed");
      setTimeout(() => setStatusMsg(""), 3000);
    }
    setBusy(false);
  }, [selectedId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) {
        return;
      }

      if (!sheetOpen) {
        if (e.key === "j" || e.key === "ArrowDown") {
          e.preventDefault();
          setFocusIdx((i) => Math.min(i + 1, Math.max(leads.length - 1, 0)));
        } else if (e.key === "k" || e.key === "ArrowUp") {
          e.preventDefault();
          setFocusIdx((i) => Math.max(i - 1, 0));
        } else if (e.key === "Enter" && leads[focusIdx]) {
          e.preventDefault();
          openLead(leads[focusIdx], focusIdx);
        }
        return;
      }

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        const next = Math.min(focusIdx + 1, leads.length - 1);
        if (leads[next]) openLead(leads[next], next);
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        const prev = Math.max(focusIdx - 1, 0);
        if (leads[prev]) openLead(leads[prev], prev);
      } else if (e.key === "c") {
        e.preventDefault();
        handleStatus("CONTACTED");
      } else if (e.key === "p") {
        e.preventDefault();
        handleStatus("PROPOSAL_SENT");
      } else if (e.key === "s") {
        e.preventDefault();
        handleStatus("SKIPPED");
      } else if (e.key === "w") {
        e.preventDefault();
        handleStatus("WON");
      } else if (e.key === "l") {
        e.preventDefault();
        handleStatus("LOST");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen, leads, focusIdx, handleStatus]);

  const hotCount = leads.filter((l) => l.verdict === "HOT").length;
  const warmCount = leads.filter((l) => l.verdict === "WARM").length;

  if (error && leads.length === 0) {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center">
        <h1 className="text-2xl font-semibold tracking-tight mb-3">Backend Not Running</h1>
        <p className="text-muted-foreground mb-4">{error}</p>
        <code className="block bg-muted rounded p-2 text-xs text-left">
          ./run.sh
          <br />
          make backend
          <br />
          make frontend
        </code>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {loading
              ? "Loading..."
              : `${leads.length} total · ${hotCount} hot · ${warmCount} warm`}
            <span className="mx-2">·</span>
            <span className="text-xs">
              <kbd className="text-[10px]">j</kbd>/<kbd className="text-[10px]">k</kbd> move ·{" "}
              <kbd className="text-[10px]">↵</kbd> open
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-accent"
        >
          {loading ? "..." : "Refresh"}
        </button>
      </div>

      {(blockMsg || statusMsg) && (
        <div className="rounded-md border border-green-500/30 bg-green-500/10 text-green-400 px-4 py-2 text-sm">
          {statusMsg || blockMsg}
        </div>
      )}

      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => setFilter("")}
          className={`rounded-md px-3 py-1 text-xs ${!filter ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:bg-accent"}`}
        >
          All
        </button>
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={`rounded-md px-3 py-1 text-xs ${filter === s ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:bg-accent"}`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground animate-pulse">Loading...</p>
      ) : leads.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No leads yet. Run a prospect scan from the Dashboard.
        </p>
      ) : (
        <div className="space-y-2">
          {leads.map((lead, idx) => {
            const isBlocked =
              lead.company && blocked.includes(lead.company.toLowerCase());
            const focused = idx === focusIdx;
            return (
              <div
                key={lead.id}
                role="button"
                tabIndex={0}
                onClick={() => openLead(lead, idx)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openLead(lead, idx);
                  }
                }}
                className={`rounded-lg border p-4 text-left transition-colors cursor-pointer ${
                  focused ? "ring-2 ring-ring" : ""
                } ${
                  isBlocked
                    ? "border-red-500/30 opacity-60"
                    : "border-border bg-card hover:bg-accent/50"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-block size-2 rounded-full shrink-0 ${verdictDot(lead.verdict)}`}
                      />
                      <span className="font-medium truncate">{lead.title}</span>
                      {lead.tier ? (
                        <span className="text-xs text-muted-foreground shrink-0">T{lead.tier}</span>
                      ) : null}
                    </div>
                    {lead.company && (
                      <p className="text-sm text-muted-foreground">{lead.company}</p>
                    )}
                    <SignalChips signals={lead.signals} limit={4} />
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      className={`text-lg font-semibold tabular-nums ${
                        lead.verdict === "HOT"
                          ? "text-red-500"
                          : lead.verdict === "WARM"
                            ? "text-amber-500"
                            : "text-muted-foreground"
                      }`}
                    >
                      {lead.score}
                    </p>
                    <p className="text-xs text-muted-foreground">{lead.source}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{lead.status}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                  <span>{new Date(lead.discovered_at).toLocaleDateString()}</span>
                  {lead.company && !isBlocked && (
                    <button
                      type="button"
                      className="ml-auto text-red-400 hover:text-red-300"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleBlock(lead.company!);
                      }}
                    >
                      Block {lead.company}
                    </button>
                  )}
                  {isBlocked && <span className="ml-auto text-red-400">Blocked</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <LeadDetailSheet
        lead={selected}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onStatus={handleStatus}
        busy={busy}
      />
    </div>
  );
}
