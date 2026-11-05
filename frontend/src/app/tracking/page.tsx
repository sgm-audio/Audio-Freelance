"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ActivePursuit,
  clearFetchCache,
  fetchActivePursuits,
  fetchFollowUps,
  fetchTracking,
  fetchWonLost,
  FollowUpQueueResponse,
  generateFollowUpDraft,
  Lead,
  OutreachDraft,
  sendOutreach,
  TrackingEvent,
  updateLeadStatus,
  WonLostSummary,
} from "@/lib/api";

export default function TrackingPage() {
  const [followUps, setFollowUps] = useState<FollowUpQueueResponse | null>(null);
  const [pursuits, setPursuits] = useState<ActivePursuit[]>([]);
  const [summary, setSummary] = useState<WonLostSummary | null>(null);
  const [events, setEvents] = useState<TrackingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string>("");

  // Inline follow-up composer state per lead
  const [activeFollowUpLeadId, setActiveFollowUpLeadId] = useState<string | null>(null);
  const [fuDraft, setFuDraft] = useState<OutreachDraft | null>(null);
  const [fuRecipient, setFuRecipient] = useState("");
  const [fuSubject, setFuSubject] = useState("");
  const [fuBody, setFuBody] = useState("");
  const [fuAssetId, setFuAssetId] = useState("");
  const [fuBusy, setFuBusy] = useState(false);
  const [fuError, setFuError] = useState("");

  const loadAll = useCallback(async () => {
    setLoading(true);
    clearFetchCache();
    await Promise.allSettled([
      fetchFollowUps().then(setFollowUps).catch(() => {}),
      fetchActivePursuits().then((r) => setPursuits(r.active)).catch(() => {}),
      fetchWonLost().then(setSummary).catch(() => {}),
      fetchTracking(30).then((r) => setEvents(r.events)).catch(() => {}),
    ]);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function handleQuickOutcome(leadId: string, nextStatus: "REPLIED" | "WON" | "ARCHIVED") {
    try {
      await updateLeadStatus(leadId, nextStatus);
      setToast(`Marked lead ${nextStatus}`);
      await loadAll();
    } catch {
      setToast("Failed to update lead status");
    }
  }

  async function openFollowUpComposer(lead: Lead, overrideAssetId?: string) {
    setActiveFollowUpLeadId(lead.id);
    setFuBusy(true);
    setFuError("");
    try {
      const draft = await generateFollowUpDraft(lead.id, overrideAssetId);
      setFuDraft(draft);
      setFuRecipient(draft.contact_email || lead.contact_email || "");
      setFuSubject(draft.subject || `Re: ${lead.last_subject || lead.title}`);
      setFuBody(draft.body || draft.draft);
      setFuAssetId(draft.selected_asset_id || "");
    } catch (e: unknown) {
      setFuError((e as Error).message || "Failed to generate follow-up draft");
    } finally {
      setFuBusy(false);
    }
  }

  async function handleSendFollowUp(lead: Lead) {
    if (!fuBody.trim()) return;
    setFuBusy(true);
    setFuError("");
    const hasEmail = fuRecipient.trim().includes("@");
    try {
      if (!hasEmail) {
        try {
          await navigator.clipboard.writeText(fuBody.trim());
        } catch {
          // ignore clipboard errors in headless mode
        }
        if (lead.url) {
          window.open(lead.url, "_blank", "noopener,noreferrer");
        }
      }

      const res = await sendOutreach(lead.id, {
        body: fuBody.trim(),
        subject: fuSubject.trim() || undefined,
        recipient_email: hasEmail ? fuRecipient.trim() : undefined,
        target_url: lead.url,
        step: "follow_up_1",
        mode: hasEmail ? "email" : "assisted",
        asset_id: fuAssetId || undefined,
      });

      if (res.transport === "compose" && res.compose_urls?.mailto_url) {
        window.open(res.compose_urls.mailto_url, "_blank", "noopener,noreferrer");
      }

      setToast(
        res.transport === "smtp"
          ? `Follow-Up #1 sent via SMTP to ${res.recipient_email}`
          : res.transport === "compose"
            ? "Opened email compose & logged Follow-Up #1"
            : "Copied Follow-Up #1, opened post & marked FOLLOW_UP_1_SENT",
      );
      setActiveFollowUpLeadId(null);
      setFuDraft(null);
      await loadAll();
    } catch (e: unknown) {
      setFuError((e as Error).message || "Failed to send follow-up");
    } finally {
      setFuBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground animate-pulse">Loading tracking data...</p>
      </div>
    );
  }

  const dueLeads = followUps?.due || [];
  const upcomingLeads = followUps?.upcoming || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tracking & Follow-Ups</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Follow-up queue, active pursuits, status transitions, and pipeline effectiveness.
          </p>
        </div>
        <button
          type="button"
          onClick={loadAll}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-accent"
        >
          Refresh
        </button>
      </div>

      {toast && (
        <div
          role="status"
          className="rounded-md border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm text-green-400"
        >
          {toast}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="rounded-lg border border-amber-500/40 bg-card p-3">
          <p className="text-xs text-muted-foreground uppercase">Follow-Ups Due</p>
          <p className="text-xl font-semibold text-amber-400 mt-1">{dueLeads.length}</p>
        </div>
        {summary && (
          <>
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
              <p className="text-xl font-semibold text-blue-400 mt-1">{summary.active_pursuits}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground uppercase">Win Rate</p>
              <p className="text-xl font-semibold mt-1">{summary.win_rate}%</p>
            </div>
          </>
        )}
      </div>

      {/* Follow-Ups Due Queue */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-amber-400 uppercase tracking-wider">
            Follow-Ups Due Now ({dueLeads.length})
          </h2>
          {upcomingLeads.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {upcomingLeads.length} scheduled upcoming
            </span>
          )}
        </div>

        {dueLeads.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No follow-ups due right now. Sent pitches automatically surface here after 4 days (email) or 3 days (DM).
          </p>
        ) : (
          <div className="space-y-2.5">
            {dueLeads.map((lead) => {
              const isOpen = activeFollowUpLeadId === lead.id;
              const hasEmail = (fuRecipient || lead.contact_email || "").includes("@");
              return (
                <div
                  key={lead.id}
                  className="rounded-lg border border-amber-500/40 bg-card p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[11px] font-medium">
                          FOLLOW-UP DUE
                        </span>
                        <span className="font-medium text-sm truncate">{lead.title}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {[
                          lead.company,
                          lead.channel ? `ch:${lead.channel}` : null,
                          lead.contact_email,
                          lead.sent_at
                            ? `Sent ${new Date(lead.sent_at).toLocaleDateString()}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          isOpen
                            ? setActiveFollowUpLeadId(null)
                            : openFollowUpComposer(lead)
                        }
                        className="rounded-md bg-primary text-primary-foreground px-3 py-1 text-xs font-medium hover:bg-primary/90"
                      >
                        {isOpen ? "Close Composer" : "Generate Follow-Up"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickOutcome(lead.id, "REPLIED")}
                        className="rounded-md border border-border bg-background px-2.5 py-1 text-xs hover:bg-accent"
                      >
                        Mark Replied
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickOutcome(lead.id, "WON")}
                        className="rounded-md border border-green-500/40 text-green-400 px-2.5 py-1 text-xs hover:bg-green-500/10"
                      >
                        Won
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickOutcome(lead.id, "ARCHIVED")}
                        className="rounded-md border border-border text-muted-foreground px-2.5 py-1 text-xs hover:bg-accent"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="border-t border-border pt-3 space-y-2.5">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[11px] text-muted-foreground mb-1">
                            To Email
                          </label>
                          <input
                            type="email"
                            value={fuRecipient}
                            onChange={(e) => setFuRecipient(e.target.value)}
                            placeholder="Leave blank for Assisted send"
                            className="w-full rounded-md border border-border bg-background px-2.5 py-1 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-muted-foreground mb-1">
                            Subject (Threaded Re:)
                          </label>
                          <input
                            type="text"
                            value={fuSubject}
                            onChange={(e) => setFuSubject(e.target.value)}
                            className="w-full rounded-md border border-border bg-background px-2.5 py-1 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-muted-foreground mb-1">
                            Portfolio Proof Asset
                          </label>
                          <select
                            value={fuAssetId}
                            onChange={(e) => {
                              setFuAssetId(e.target.value);
                              openFollowUpComposer(lead, e.target.value);
                            }}
                            className="w-full rounded-md border border-border bg-background px-2.5 py-1 text-xs"
                          >
                            {(fuDraft?.available_assets || []).map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.id}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <textarea
                        rows={5}
                        value={fuBody}
                        onChange={(e) => setFuBody(e.target.value)}
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-mono"
                      />

                      {fuError && <p className="text-xs text-red-400">{fuError}</p>}

                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          disabled={fuBusy || !fuBody.trim()}
                          onClick={() => handleSendFollowUp(lead)}
                          className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
                        >
                          {fuBusy
                            ? "Sending…"
                            : hasEmail
                              ? "Send Follow-Up Email"
                              : "Copy Follow-Up & Open Post"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {upcomingLeads.length > 0 && (
          <details className="rounded-lg border border-border bg-card p-3">
            <summary className="text-xs font-medium text-muted-foreground cursor-pointer">
              Scheduled Upcoming Follow-Ups ({upcomingLeads.length})
            </summary>
            <div className="mt-2 space-y-1.5">
              {upcomingLeads.map((lead) => (
                <div
                  key={lead.id}
                  className="flex items-center justify-between text-xs py-1 border-b border-border/50 last:border-0"
                >
                  <span className="truncate font-medium">{lead.title}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-muted-foreground">
                      Due{" "}
                      {lead.next_follow_up_at
                        ? new Date(lead.next_follow_up_at).toLocaleDateString()
                        : "soon"}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleQuickOutcome(lead.id, "REPLIED")}
                      className="underline text-muted-foreground hover:text-foreground"
                    >
                      Mark Replied
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

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
