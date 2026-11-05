"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  fetchOutreachLog,
  fetchPortfolioAssets,
  generateFollowUpDraft,
  generateOutreach,
  Lead,
  OutreachConflictError,
  OutreachDraft,
  OutreachLogEntry,
  OutreachTemplateKey,
  PortfolioAsset,
  sendOutreach,
} from "@/lib/api";

const QUICK_TRIAGE = ["SENT", "REPLIED", "WON", "SKIPPED"] as const;
const MORE_TRIAGE = ["APPROVED", "PROPOSAL_SENT", "LOST", "ARCHIVED", "DEAD"] as const;

const TEMPLATES: { key: OutreachTemplateKey; label: string }[] = [
  { key: "A_plugin_contract", label: "A · Plugin" },
  { key: "B_reaper_automation", label: "B · REAPER" },
  { key: "C_game_audio", label: "C · Game" },
  { key: "D_cold_outbound", label: "D · Cold" },
];

function verdictDot(verdict: Lead["verdict"]) {
  if (verdict === "HOT") return "bg-red-500";
  if (verdict === "WARM") return "bg-amber-500";
  if (verdict === "SKIP") return "bg-gray-500";
  return "bg-blue-500";
}

function isActionableLead(lead: Lead): boolean {
  if (
    ["SENT", "CONTACTED", "FOLLOW_UP_1_DUE", "APPROVED", "DRAFT_READY"].includes(
      lead.status,
    )
  ) {
    return true;
  }
  if (lead.status === "COLD" || lead.status === "SKIPPED" || lead.verdict === "COLD" || lead.verdict === "SKIP") {
    return false;
  }
  return lead.verdict === "HOT" || lead.verdict === "WARM";
}

export function SignalChips({
  signals,
  limit,
}: {
  signals: Record<string, number>;
  limit?: number;
}) {
  const entries = Object.entries(signals).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const shown = limit ? entries.slice(0, limit) : entries;
  if (shown.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map(([name, pts]) => (
        <Badge
          key={name}
          variant="outline"
          className={
            pts > 0
              ? "border-green-500/40 text-green-600 dark:text-green-400"
              : pts < 0
                ? "border-red-500/40 text-red-600 dark:text-red-400"
                : undefined
          }
        >
          {name.replace(/_/g, " ")} {pts > 0 ? `+${pts}` : pts}
        </Badge>
      ))}
      {limit && entries.length > limit ? (
        <Badge variant="secondary">+{entries.length - limit}</Badge>
      ) : null}
    </div>
  );
}

export function LeadDetailSheet({
  lead,
  open,
  onOpenChange,
  onStatus,
  onLeadUpdated,
  busy,
}: {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatus: (status: string) => void;
  onLeadUpdated?: (updated: Lead) => void;
  busy?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<"compose" | "brief" | "history">("compose");
  const [template, setTemplate] = useState<OutreachTemplateKey | "">("");
  const [draft, setDraft] = useState<OutreachDraft | null>(null);
  const [step, setStep] = useState<"initial" | "follow_up_1">("initial");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [availableAssets, setAvailableAssets] = useState<PortfolioAsset[]>([]);
  const [smtpConfigured, setSmtpConfigured] = useState(false);

  const [draftBusy, setDraftBusy] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [draftErr, setDraftErr] = useState("");
  const [sendSuccess, setSendSuccess] = useState("");
  const [conflict, setConflict] = useState<{ reason: string; message: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<OutreachLogEntry[]>([]);

  useEffect(() => {
    fetchPortfolioAssets()
      .then((res) => {
        if (res.assets?.length) setAvailableAssets(res.assets);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setDraft(null);
    setDraftErr("");
    setSendSuccess("");
    setConflict(null);
    setCopied(false);
    setTemplate("");
    if (lead) {
      setActiveTab(isActionableLead(lead) ? "compose" : "brief");
      const isFollowUpReady =
        lead.status === "SENT" ||
        lead.status === "CONTACTED" ||
        lead.status === "FOLLOW_UP_1_DUE";
      setStep(isFollowUpReady ? "follow_up_1" : "initial");
      setRecipientEmail(lead.contact_email || "");
      setTargetUrl(lead.url || "");
      setSubject(lead.last_subject || "");
      setBody("");
      setSelectedAssetId(lead.last_asset_id || "");
      fetchOutreachLog(lead.id, 10)
        .then((res) => setHistory(res.entries))
        .catch(() => setHistory([]));
    } else {
      setHistory([]);
    }
  }, [lead?.id, lead?.status, lead?.verdict, lead?.contact_email, lead?.url, lead?.last_subject, lead?.last_asset_id]);

  const selected = lead;
  if (!selected) return null;

  const leadId = selected.id;
  const leadUrl = selected.url;
  const sorted = Object.entries(selected.signals).sort((a, b) => b[1] - a[1]);
  const hasEmail = recipientEmail.trim().includes("@");
  const snippetPreview = (selected.raw_text || "").trim().slice(0, 220);

  function applyDraftResult(result: OutreachDraft, nextStep: "initial" | "follow_up_1") {
    setDraft(result);
    setStep(nextStep);
    setSubject(result.subject || "");
    setBody(result.body || result.draft || "");
    if (result.contact_email && !recipientEmail) {
      setRecipientEmail(result.contact_email);
    }
    if (result.target_url) {
      setTargetUrl(result.target_url);
    }
    setSelectedAssetId(result.selected_asset_id || "");
    if (result.available_assets?.length) {
      setAvailableAssets(result.available_assets);
    }
    setSmtpConfigured(Boolean(result.smtp_configured));
  }

  async function handleGenerate(overrideAssetId?: string, overrideStep?: "initial" | "follow_up_1") {
    const targetStep = overrideStep || step;
    setDraftBusy(true);
    setDraftErr("");
    setSendSuccess("");
    setConflict(null);
    setCopied(false);
    try {
      const assetToUse =
        overrideAssetId !== undefined ? overrideAssetId : selectedAssetId || undefined;
      if (targetStep === "follow_up_1") {
        const result = await generateFollowUpDraft(leadId, assetToUse);
        applyDraftResult(result, "follow_up_1");
      } else {
        const result = await generateOutreach(
          leadId,
          template || undefined,
          assetToUse,
        );
        applyDraftResult(result, "initial");
      }
    } catch (e: unknown) {
      const err = e as { name?: string; message?: string };
      if (err.name === "AbortError") setDraftErr("Backend not responding.");
      else setDraftErr(err.message || "Draft generation failed.");
      setDraft(null);
    }
    setDraftBusy(false);
  }

  async function handleCopy() {
    const textToCopy = body.trim() || draft?.draft || "";
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setDraftErr("Could not copy to clipboard.");
    }
  }

  async function handleSend(forceOverride = false) {
    const cleanBody = body.trim();
    if (!cleanBody) {
      setDraftErr("Pitch body cannot be empty.");
      return;
    }
    setSendBusy(true);
    setDraftErr("");
    setSendSuccess("");
    setConflict(null);

    try {
      if (!hasEmail) {
        try {
          await navigator.clipboard.writeText(cleanBody);
          setCopied(true);
        } catch {
          // Clipboard permission may be denied in headless contexts; continue logging send
        }
        const openUrl = targetUrl.trim() || leadUrl;
        if (openUrl) {
          window.open(openUrl, "_blank", "noopener,noreferrer");
        }
      }

      const res = await sendOutreach(leadId, {
        body: cleanBody,
        subject: subject.trim() || undefined,
        recipient_email: hasEmail ? recipientEmail.trim() : undefined,
        target_url: targetUrl.trim() || leadUrl,
        step,
        mode: hasEmail ? "email" : "assisted",
        asset_id: selectedAssetId || undefined,
        force: forceOverride,
      });

      if (res.transport === "compose" && res.compose_urls?.mailto_url) {
        window.open(res.compose_urls.mailto_url, "_blank", "noopener,noreferrer");
      }

      const followUpNote = res.next_follow_up_at
        ? ` · Follow-up due ${new Date(res.next_follow_up_at).toLocaleDateString()}`
        : "";
      setSendSuccess(
        res.transport === "smtp"
          ? `Sent via SMTP to ${res.recipient_email}${followUpNote}`
          : res.transport === "compose"
            ? `Opened email composer & logged send${followUpNote}`
            : `Copied pitch, opened post & marked SENT${followUpNote}`,
      );

      setHistory((prev) => [res.log_entry, ...prev]);
      if (onLeadUpdated && res.lead) {
        onLeadUpdated(res.lead);
      }
    } catch (e: unknown) {
      if (e instanceof OutreachConflictError) {
        setConflict({ reason: e.reason, message: e.message });
      } else {
        setDraftErr((e as Error).message || "Failed to send outreach.");
      }
    } finally {
      setSendBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-xl w-full flex flex-col gap-0 p-0 overflow-hidden">
        {/* Pinned Console Header */}
        <SheetHeader className="border-b border-border bg-card/60 px-4 py-3 pr-12 space-y-2 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={`inline-block size-2 rounded-full shrink-0 ${verdictDot(selected.verdict)}`} />
                <SheetTitle className="text-left text-base leading-snug truncate">
                  {selected.title}
                </SheetTitle>
              </div>
              <SheetDescription className="text-left text-xs mt-0.5 truncate">
                {[
                  selected.company,
                  selected.source,
                  selected.channel ? `ch:${selected.channel}` : null,
                  `T${selected.tier}`,
                  selected.niche.replace(/_/g, " "),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </SheetDescription>
            </div>
            <div className="text-right shrink-0">
              <div className="flex items-baseline justify-end gap-1.5">
                <span className="text-2xl font-semibold tabular-nums leading-none">
                  {selected.score}
                </span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {selected.verdict}
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                {selected.status}
                {selected.next_follow_up_at
                  ? ` · Due ${new Date(selected.next_follow_up_at).toLocaleDateString()}`
                  : ""}
              </p>
            </div>
          </div>

          <SignalChips signals={selected.signals} limit={4} />
        </SheetHeader>

        {/* Tabbed Console Body */}
        <Tabs
          value={activeTab}
          onValueChange={(val) => setActiveTab(val as "compose" | "brief" | "history")}
          className="flex-1 flex flex-col min-h-0 overflow-hidden gap-0"
        >
          <div className="border-b border-border bg-muted/30 px-4 shrink-0">
            <TabsList variant="line" className="h-9 w-full justify-start gap-4">
              <TabsTrigger value="compose" className="text-xs px-2">
                Compose Pitch
              </TabsTrigger>
              <TabsTrigger value="brief" className="text-xs px-2">
                Brief & Signals ({sorted.length})
              </TabsTrigger>
              <TabsTrigger value="history" className="text-xs px-2">
                History ({history.length})
              </TabsTrigger>
            </TabsList>
          </div>

          {/* TAB 1: COMPOSE PITCH */}
          <TabsContent value="compose" className="flex-1 overflow-y-auto p-4 space-y-3">
            {/* Collapsible 2-line Job Context Preview */}
            {snippetPreview && (
              <details className="rounded border border-border/70 bg-muted/20 px-3 py-1.5 text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground truncate">
                  <span className="font-medium text-foreground mr-1.5">Job context:</span>
                  {snippetPreview}
                </summary>
                <p className="mt-2 whitespace-pre-wrap break-words text-muted-foreground max-h-36 overflow-y-auto border-t border-border/50 pt-2">
                  {selected.raw_text}
                </p>
              </details>
            )}

            {/* Single-Row Console Control Bar */}
            <div className="flex flex-wrap items-center gap-1.5 rounded border border-border bg-card p-2">
              <select
                aria-label="Outreach step"
                value={step}
                onChange={(e) => {
                  const nextStep = e.target.value as "initial" | "follow_up_1";
                  setStep(nextStep);
                  if (nextStep === "follow_up_1") {
                    handleGenerate(undefined, "follow_up_1");
                  }
                }}
                className="rounded border border-border bg-background px-2 py-1 text-xs font-medium"
              >
                <option value="initial">Step: Initial Pitch</option>
                <option value="follow_up_1">Step: Follow-Up #1</option>
              </select>

              {step === "initial" && (
                <select
                  aria-label="Outreach template"
                  value={template}
                  onChange={(e) => setTemplate(e.target.value as OutreachTemplateKey | "")}
                  disabled={draftBusy}
                  className="rounded border border-border bg-background px-2 py-1 text-xs"
                >
                  <option value="">Template: Auto ({selected.niche})</option>
                  {TEMPLATES.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </select>
              )}

              {availableAssets.length > 0 && (
                <select
                  aria-label="Portfolio Asset"
                  value={selectedAssetId}
                  onChange={(e) => {
                    const nextAsset = e.target.value;
                    setSelectedAssetId(nextAsset);
                    handleGenerate(nextAsset);
                  }}
                  disabled={draftBusy}
                  className="rounded border border-border bg-background px-2 py-1 text-xs"
                >
                  <option value="">Asset: Auto</option>
                  {availableAssets.map((a) => (
                    <option key={a.id} value={a.id}>
                      Asset: {a.id}
                    </option>
                  ))}
                </select>
              )}

              <Button
                size="sm"
                disabled={draftBusy}
                onClick={() => handleGenerate()}
                className="ml-auto h-7 px-2.5 text-xs"
              >
                {draftBusy
                  ? "Generating…"
                  : body.trim()
                    ? "Regenerate"
                    : step === "follow_up_1"
                      ? "Generate Follow-Up"
                      : "Generate Draft"}
              </Button>
            </div>

            {/* Editable Recipient & URL Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] text-muted-foreground">
                    To Email
                  </label>
                  <span className="text-[10px] text-muted-foreground">
                    {hasEmail
                      ? smtpConfigured
                        ? "SMTP direct"
                        : "Compose handoff"
                      : `Assisted (${selected.channel || "web"})`}
                  </span>
                </div>
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="Leave blank for Assisted URL send"
                  className="w-full rounded border border-border bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">
                  Target Post / Application URL
                </label>
                <input
                  type="url"
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded border border-border bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>

            {/* Editable Subject */}
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1">
                Subject Line {step === "follow_up_1" ? "(threads via Re: & In-Reply-To)" : ""}
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject line..."
                className="w-full rounded border border-border bg-background px-2.5 py-1.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* Editable Pitch Body */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] text-muted-foreground">Pitch Body</label>
                {draft && (
                  <span
                    className={`text-[11px] ${
                      draft.safe_to_send ? "text-green-400" : "text-amber-400"
                    }`}
                  >
                    {draft.safe_to_send
                      ? "✓ Asset claims verified"
                      : `⚠ ${draft.violations.length} claim warning(s)`}
                  </span>
                )}
              </div>
              {draft && !draft.safe_to_send && (
                <ul className="text-xs text-amber-400 space-y-1 mb-1.5">
                  {draft.violations.map((v) => (
                    <li key={v}>{v}</li>
                  ))}
                </ul>
              )}
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Click 'Generate Draft' above or write your pitch directly..."
                rows={9}
                className="w-full rounded border border-border bg-background px-3 py-2 text-xs font-mono whitespace-pre-wrap resize-y focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {draftErr && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded px-2.5 py-1.5">
                {draftErr}
              </p>
            )}

            {conflict && (
              <div className="rounded border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs space-y-2">
                <p className="text-amber-300 font-medium">
                  Duplicate Guard Triggered: {conflict.message}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={sendBusy}
                  onClick={() => handleSend(true)}
                >
                  Send Anyway (Override 30-Day Guard)
                </Button>
              </div>
            )}

            {sendSuccess && (
              <p className="text-xs text-green-400 bg-green-500/10 border border-green-500/30 rounded px-2.5 py-1.5">
                {sendSuccess}
              </p>
            )}

            {/* Primary Send & Copy Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  disabled={sendBusy || !body.trim()}
                  onClick={() => handleSend(false)}
                >
                  {sendBusy
                    ? "Sending…"
                    : hasEmail
                      ? step === "follow_up_1"
                        ? "Send Follow-Up Email"
                        : "Approve & Send Email"
                      : step === "follow_up_1"
                        ? "Copy Follow-Up & Open Post"
                        : "Copy Pitch & Open Post"}
                </Button>
                {body.trim() && (
                  <Button size="sm" variant="outline" onClick={handleCopy}>
                    {copied ? "Copied!" : "Copy Text"}
                  </Button>
                )}
              </div>

              <a
                href={leadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex text-xs underline underline-offset-2 hover:text-foreground text-muted-foreground"
              >
                Open post ↗
              </a>
            </div>
          </TabsContent>

          {/* TAB 2: BRIEF & SIGNALS */}
          <TabsContent value="brief" className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Discovered {new Date(selected.discovered_at).toLocaleString()}</span>
              <a
                href={leadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                Open source URL ↗
              </a>
            </div>

            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">
                Contact Path
              </p>
              <p className="text-xs font-mono bg-muted/20 border border-border rounded px-2.5 py-1.5">
                {selected.contact_email || selected.contact_path || "No direct contact path extracted"}
              </p>
            </div>

            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">
                Full Job Text
              </p>
              <p className="text-sm whitespace-pre-wrap break-words text-muted-foreground rounded border border-border bg-muted/20 p-3 max-h-72 overflow-y-auto">
                {selected.raw_text || "—"}
              </p>
            </div>

            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">
                Signal Breakdown ({sorted.length})
              </p>
              {sorted.length === 0 ? (
                <p className="text-xs text-muted-foreground">No signals matched.</p>
              ) : (
                <div className="rounded border border-border bg-card divide-y divide-border/60">
                  {sorted.map(([name, pts]) => (
                    <div key={name} className="flex justify-between text-xs px-3 py-1.5 gap-4">
                      <span className="text-muted-foreground">{name.replace(/_/g, " ")}</span>
                      <span
                        className={`font-medium tabular-nums ${
                          pts > 0 ? "text-green-500" : pts < 0 ? "text-red-500" : ""
                        }`}
                      >
                        {pts > 0 ? `+${pts}` : pts}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* TAB 3: OUTREACH HISTORY */}
          <TabsContent value="history" className="flex-1 overflow-y-auto p-4 space-y-3">
            {history.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No outreach sent for this lead yet. Use the Compose tab to send an initial pitch.
              </p>
            ) : (
              <div className="space-y-2">
                {history.map((h) => (
                  <div
                    key={h.id}
                    className="rounded border border-border bg-card p-3 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold uppercase text-[10px] tracking-wider">
                        {h.step} · {h.transport} ({h.channel})
                      </span>
                      <span className="text-muted-foreground">
                        {new Date(h.sent_at).toLocaleString()}
                      </span>
                    </div>
                    {h.recipient && (
                      <p className="text-muted-foreground">To: {h.recipient}</p>
                    )}
                    {h.subject && (
                      <p className="font-medium text-foreground">Subject: {h.subject}</p>
                    )}
                    {h.final_body_sent && (
                      <pre className="mt-1 rounded border border-border/50 bg-muted/20 p-2 text-[11px] font-mono whitespace-pre-wrap text-muted-foreground">
                        {h.final_body_sent}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Streamlined Single-Line Triage Footer */}
        <SheetFooter className="border-t border-border bg-popover px-4 py-2.5 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-2 w-full">
            <div className="flex flex-wrap items-center gap-1">
              {QUICK_TRIAGE.map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={selected.status === s ? "default" : "outline"}
                  disabled={busy || selected.status === s}
                  onClick={() => onStatus(s)}
                  className="h-7 px-2 text-xs"
                >
                  {s}
                </Button>
              ))}
              <select
                aria-label="More status actions"
                value={MORE_TRIAGE.includes(selected.status as (typeof MORE_TRIAGE)[number]) ? selected.status : ""}
                onChange={(e) => {
                  if (e.target.value) onStatus(e.target.value);
                }}
                disabled={busy}
                className="h-7 rounded border border-border bg-background px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <option value="">More status…</option>
                {MORE_TRIAGE.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
            <span className="text-[10px] text-muted-foreground hidden sm:inline">
              <kbd>c</kbd> contact · <kbd>p</kbd> proposal · <kbd>s</kbd> skip · <kbd>w</kbd>/<kbd>l</kbd> won/lost
            </span>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export { verdictDot };
