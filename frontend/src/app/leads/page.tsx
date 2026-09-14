"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  LeadDetailSheet,
  SignalChips,
  verdictDot,
} from "@/components/lead-detail-sheet";
import {
  addBlockedCompany,
  addManualLead,
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [focusIdx, setFocusIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"score" | "newest" | "oldest">("score");
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoRef = useRef<{ leadId: string; prev: string } | null>(null);

  const showToast = useCallback((t: { text: string; undo?: () => void }, ms = 5000) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(t);
    toastTimer.current = setTimeout(() => setToast(null), ms);
  }, []);

  async function undoStatus() {
    const u = undoRef.current;
    if (!u) return;
    undoRef.current = null;
    try {
      await updateLeadStatus(u.leadId, u.prev);
      setLeads((prevLeads) => prevLeads.map((l) => (l.id === u.leadId ? { ...l, status: u.prev } : l)));
      showToast({ text: "Reverted" }, 2500);
    } catch {
      showToast({ text: "Undo failed" });
    }
  }

  function handleModalKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      setShowQuickAdd(false);
      return;
    }
    if (e.key !== "Tab") return;
    const focusables = e.currentTarget.querySelectorAll<HTMLElement>(
      'input, textarea, select, button, [tabindex]:not([tabindex="-1"])',
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  // Quick Add modal state
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickUrl, setQuickUrl] = useState("");
  const [quickSnippet, setQuickSnippet] = useState("");
  const [quickSource, setQuickSource] = useState("manual");
  const [quickCompany, setQuickCompany] = useState("");
  const [quickNiche, setQuickNiche] = useState("plugin_dev");
  const [quickSubmitting, setQuickSubmitting] = useState(false);
  const [quickResult, setQuickResult] = useState("");

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

  const visible = leads
    .filter((l) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return (
        l.title.toLowerCase().includes(q) ||
        (l.company ?? "").toLowerCase().includes(q) ||
        (l.raw_text ?? "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (sort === "newest") return +new Date(b.discovered_at) - +new Date(a.discovered_at);
      if (sort === "oldest") return +new Date(a.discovered_at) - +new Date(b.discovered_at);
      return b.score - a.score;
    });

  function openLead(lead: Lead, idx: number) {
    setSelectedId(lead.id);
    setFocusIdx(idx);
    setSheetOpen(true);
  }

  async function handleBlock(name: string) {
    try {
      await addBlockedCompany(name);
      setBlocked([...blocked, name.toLowerCase()]);
      showToast({ text: `"${name}" blocked` }, 3000);
    } catch {
      showToast({ text: "Failed to block company" });
    }
  }

  async function handleQuickAdd() {
    if (!quickTitle || !quickUrl || !quickSnippet) return;
    setQuickSubmitting(true);
    setQuickResult("");
    try {
      const lead = await addManualLead({
        title: quickTitle,
        url: quickUrl,
        snippet: quickSnippet,
        source: quickSource,
        company: quickCompany || undefined,
        niche: quickNiche,
      });
      setQuickResult(`${lead.verdict} · score ${lead.score}`);
      setQuickTitle("");
      setQuickUrl("");
      setQuickSnippet("");
      setQuickCompany("");
      await load();
    } catch (e: unknown) {
      setQuickResult(`Error: ${(e as Error).message || "Failed"}`);
    }
    setQuickSubmitting(false);
  }

  const handleStatus = useCallback(async (status: string) => {
    if (!selectedId) return;
    const prevStatus = leads.find((l) => l.id === selectedId)?.status;
    setBusy(true);
    try {
      await updateLeadStatus(selectedId, status);
      setLeads((prev) =>
        prev.map((l) => (l.id === selectedId ? { ...l, status } : l)),
      );
      if (prevStatus && prevStatus !== status) {
        undoRef.current = { leadId: selectedId, prev: prevStatus };
        showToast({ text: `→ ${status}`, undo: undoStatus });
      } else {
        showToast({ text: `→ ${status}` }, 2500);
      }
    } catch {
      showToast({ text: "Status update failed" });
    }
    setBusy(false);
  }, [selectedId, leads, showToast]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) {
        return;
      }

      if (!sheetOpen) {
        if (e.key === "j" || e.key === "ArrowDown") {
          e.preventDefault();
          setFocusIdx((i) => Math.min(i + 1, Math.max(visible.length - 1, 0)));
        } else if (e.key === "k" || e.key === "ArrowUp") {
          e.preventDefault();
          setFocusIdx((i) => Math.max(i - 1, 0));
        } else if (e.key === "Enter" && visible[focusIdx]) {
          e.preventDefault();
          openLead(visible[focusIdx], focusIdx);
        }
        return;
      }

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        const next = Math.min(focusIdx + 1, visible.length - 1);
        if (visible[next]) openLead(visible[next], next);
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        const prev = Math.max(focusIdx - 1, 0);
        if (visible[prev]) openLead(visible[prev], prev);
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
  }, [sheetOpen, visible, focusIdx, handleStatus]);

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
              : `${visible.length} shown · ${leads.length} total · ${hotCount} hot · ${warmCount} warm`}
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
        <button
          type="button"
          onClick={() => setShowQuickAdd(true)}
          className="rounded-md border border-primary/50 bg-primary/10 text-primary px-3 py-1.5 text-sm hover:bg-primary/20"
        >
          + Quick Add
        </button>
      </div>

      {toast && (
        <div role="status" className="flex items-center gap-3 rounded-md border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm text-green-400">
          <span>{toast.text}</span>
          {toast.undo && (
            <button type="button" onClick={toast.undo} className="font-medium underline hover:text-green-300">
              Undo
            </button>
          )}
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

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setFocusIdx(0);
          }}
          placeholder="Search title, company, or text..."
          aria-label="Search leads"
          className="w-64 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          aria-label="Sort leads"
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        >
          <option value="score">Sort: Score</option>
          <option value="newest">Sort: Newest</option>
          <option value="oldest">Sort: Oldest</option>
        </select>
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground animate-pulse">Loading...</p>
      ) : leads.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No leads yet. Run a prospect scan from the Dashboard.
        </p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">No leads match &quot;{query}&quot;.</p>
      ) : (
        <div className="space-y-2">
          {visible.map((lead, idx) => {
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

      {/* Quick Add Modal */}
      {showQuickAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowQuickAdd(false)} onKeyDown={handleModalKeyDown}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Quick Add Lead"
            className="bg-card border border-border rounded-lg p-6 w-full max-w-lg mx-4 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Quick Add Lead</h2>
              <button
                type="button"
                onClick={() => setShowQuickAdd(false)}
                className="text-muted-foreground hover:text-foreground text-xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Title *</label>
                <input
                  type="text"
                  autoFocus
                  value={quickTitle}
                  onChange={(e) => setQuickTitle(e.target.value)}
                  placeholder="e.g. C++ DSP Developer for CLAP Plugin"
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">URL *</label>
                <input
                  type="url"
                  value={quickUrl}
                  onChange={(e) => setQuickUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Snippet *</label>
                <textarea
                  value={quickSnippet}
                  onChange={(e) => setQuickSnippet(e.target.value)}
                  placeholder="Paste the job description or key details..."
                  rows={4}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-y"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Source</label>
                  <select
                    value={quickSource}
                    onChange={(e) => setQuickSource(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="manual">Manual</option>
                    <option value="upwork">Upwork</option>
                    <option value="linkedin">LinkedIn</option>
                    <option value="forum">Forum</option>
                    <option value="email">Email</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Niche</label>
                  <select
                    value={quickNiche}
                    onChange={(e) => setQuickNiche(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="plugin_dev">Plugin Dev</option>
                    <option value="reaper_scripts">REAPER Scripts</option>
                    <option value="rust_audio">Rust Audio</option>
                    <option value="audio_ml">Audio ML</option>
                    <option value="game_audio_dev">Game Audio</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Company (optional)</label>
                <input
                  type="text"
                  value={quickCompany}
                  onChange={(e) => setQuickCompany(e.target.value)}
                  placeholder="e.g. iZotope"
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>

            {quickResult && (
              <div className={`rounded-md px-3 py-2 text-sm ${quickResult.startsWith("Error") ? "bg-red-500/10 text-red-400 border border-red-500/30" : "bg-green-500/10 text-green-400 border border-green-500/30"}`}>
                {quickResult}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowQuickAdd(false)}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleQuickAdd}
                disabled={quickSubmitting || !quickTitle || !quickUrl || !quickSnippet}
                className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm hover:bg-primary/90 disabled:opacity-50"
              >
                {quickSubmitting ? "Saving..." : "Add Lead"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
