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
import {
  generateOutreach,
  Lead,
  OutreachDraft,
  OutreachTemplateKey,
} from "@/lib/api";

const TRIAGE = ["CONTACTED", "PROPOSAL_SENT", "WON", "LOST", "SKIPPED", "DEAD"] as const;

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
  busy,
}: {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatus: (status: string) => void;
  busy?: boolean;
}) {
  const [template, setTemplate] = useState<OutreachTemplateKey | "">("");
  const [draft, setDraft] = useState<OutreachDraft | null>(null);
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftErr, setDraftErr] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setDraft(null);
    setDraftErr("");
    setCopied(false);
    setTemplate("");
  }, [lead?.id]);

  const selected = lead;
  if (!selected) return null;

  const leadId = selected.id;
  const sorted = Object.entries(selected.signals).sort((a, b) => b[1] - a[1]);

  async function handleGenerate() {
    setDraftBusy(true);
    setDraftErr("");
    setCopied(false);
    try {
      const result = await generateOutreach(
        leadId,
        template || undefined,
      );
      setDraft(result);
    } catch (e: unknown) {
      const err = e as { name?: string; message?: string };
      if (err.name === "AbortError") setDraftErr("Backend not responding.");
      else setDraftErr(err.message || "Draft generation failed.");
      setDraft(null);
    }
    setDraftBusy(false);
  }

  async function handleCopy() {
    if (!draft?.draft) return;
    try {
      await navigator.clipboard.writeText(draft.draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setDraftErr("Could not copy to clipboard.");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-lg w-full gap-0 p-0 overflow-y-auto">
        <SheetHeader className="border-b border-border p-4 pr-12">
          <div className="flex items-center gap-2">
            <span className={`inline-block size-2 rounded-full shrink-0 ${verdictDot(selected.verdict)}`} />
            <SheetTitle className="text-left leading-snug">{selected.title}</SheetTitle>
          </div>
          <SheetDescription className="text-left">
            {[selected.company, selected.source, `T${selected.tier}`, selected.niche.replace(/_/g, " ")]
              .filter(Boolean)
              .join(" · ")}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 p-4">
          <div className="flex items-baseline gap-3">
            <p className="text-3xl font-semibold tabular-nums">{selected.score}</p>
            <div className="text-sm text-muted-foreground">
              <p>
                {selected.verdict} · {selected.status}
              </p>
              <p>{new Date(selected.discovered_at).toLocaleString()}</p>
            </div>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Signals</p>
            {sorted.length === 0 ? (
              <p className="text-sm text-muted-foreground">No signals matched.</p>
            ) : (
              <div className="space-y-1">
                {sorted.map(([name, pts]) => (
                  <div key={name} className="flex justify-between text-sm gap-4">
                    <span className="text-muted-foreground">{name.replace(/_/g, " ")}</span>
                    <span className={`font-medium tabular-nums ${pts > 0 ? "text-green-500" : pts < 0 ? "text-red-500" : ""}`}>
                      {pts > 0 ? `+${pts}` : pts}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Contact</p>
            <p className="text-sm">
              {selected.contact_path || (
                <span className="text-muted-foreground">No contact path yet</span>
              )}
            </p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Full text</p>
            <p className="text-sm whitespace-pre-wrap break-words text-muted-foreground max-h-48 overflow-y-auto">
              {selected.raw_text || "—"}
            </p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
              Outreach draft
            </p>
            <p className="text-xs text-muted-foreground mb-2">
              Generates a copyable draft only — nothing is sent.
            </p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {TEMPLATES.map((t) => (
                <Button
                  key={t.key}
                  size="sm"
                  variant={template === t.key ? "default" : "outline"}
                  disabled={draftBusy}
                  onClick={() => setTemplate(t.key)}
                >
                  {t.label}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              <Button size="sm" disabled={draftBusy} onClick={handleGenerate}>
                {draftBusy ? "Generating…" : "Generate draft"}
              </Button>
              {draft?.draft ? (
                <Button size="sm" variant="outline" onClick={handleCopy}>
                  {copied ? "Copied" : "Copy"}
                </Button>
              ) : null}
            </div>
            {draftErr ? (
              <p className="text-sm text-red-400 mb-2">{draftErr}</p>
            ) : null}
            {draft ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Template {draft.template}
                  {draft.safe_to_send
                    ? " · claims OK"
                    : ` · ${draft.violations.length} claim warning(s)`}
                </p>
                {!draft.safe_to_send ? (
                  <ul className="text-xs text-amber-400 space-y-1">
                    {draft.violations.map((v) => (
                      <li key={v}>{v}</li>
                    ))}
                  </ul>
                ) : null}
                <textarea
                  readOnly
                  value={draft.draft}
                  rows={12}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono whitespace-pre-wrap resize-y"
                />
              </div>
            ) : null}
          </div>

          <a
            href={selected.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex text-sm underline underline-offset-2 hover:text-foreground text-muted-foreground"
          >
            Open source →
          </a>
        </div>

        <SheetFooter className="border-t border-border sticky bottom-0 bg-popover">
          <p className="text-xs text-muted-foreground mb-1">
            Triage · <kbd className="text-[10px]">c</kbd> contact · <kbd className="text-[10px]">p</kbd> proposal ·{" "}
            <kbd className="text-[10px]">s</kbd> skip · <kbd className="text-[10px]">w</kbd>/<kbd className="text-[10px]">l</kbd> won/lost
          </p>
          <div className="flex flex-wrap gap-1.5">
            {TRIAGE.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={selected.status === s ? "default" : "outline"}
                disabled={busy || selected.status === s}
                onClick={() => onStatus(s)}
              >
                {s.replace(/_/g, " ")}
              </Button>
            ))}
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export { verdictDot };
