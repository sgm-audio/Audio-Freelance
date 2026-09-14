"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { OutreachSnapshot } from "@/lib/outreach-db";

function formatState(state: string): string {
  return state.replace(/_/g, " ");
}

function relativeTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const sec = Math.round((Date.now() - t) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function OutreachConsole({ initial }: { initial: OutreachSnapshot }) {
  const [snap, setSnap] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/outreach", { cache: "no-store" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as OutreachSnapshot;
      startTransition(() => {
        setSnap(data);
        setError(null);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed");
    }
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      void refresh();
    }, 20_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const maxFunnel = useMemo(() => {
    const m = Math.max(...snap.funnel.map((f) => f.count), 0);
    return m > 0 ? m : 1;
  }, [snap.funnel]);

  const pendingCount = snap.lead_counts.PENDING_APPROVAL;
  const sentCount = snap.lead_counts.SENT + snap.lead_counts.REPLIED;

  async function toggleKill() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/outreach/kill-switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: !snap.paused }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `kill switch ${res.status}`);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kill switch failed");
    } finally {
      setBusy(false);
    }
  }

  async function onCopy(id: string, body: string) {
    const ok = await copyText(body);
    if (ok) {
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 1800);
    }
  }

  const dbMissing = !snap.db_exists;
  const pipelineEmpty = snap.totals.leads === 0;

  return (
    <div className="sgm-shell" data-empty={pipelineEmpty ? "true" : "false"}>
      <header className="sgm-hero">
        <div className="sgm-atmosphere" aria-hidden="true">
          <svg className="sgm-wave" viewBox="0 0 1200 320" preserveAspectRatio="none">
            <path
              className="sgm-wave-path sgm-wave-a"
              d="M0 180 C120 80 240 280 360 160 C480 40 600 260 720 140 C840 40 960 240 1080 150 C1140 110 1180 140 1200 160 L1200 320 L0 320 Z"
            />
            <path
              className="sgm-wave-path sgm-wave-b"
              d="M0 210 C150 120 300 300 450 190 C600 80 750 280 900 170 C1050 80 1140 220 1200 190 L1200 320 L0 320 Z"
            />
          </svg>
        </div>

        <div className="sgm-topbar">
          <Link href="/" className="sgm-back">
            ← aquire
          </Link>
          <p className="sgm-live-meta">
            {snap.paused ? (
              <>
                killswitch <strong>ARMED</strong>
              </>
            ) : (
              <>
                killswitch <strong style={{ color: "var(--sgm-phosphor)" }}>CLEAR</strong>
              </>
            )}
            <span style={{ margin: "0 0.55rem", opacity: 0.4 }}>·</span>
            {snap.source === "sqlite" ? "live sqlite" : "no db — empty fixture"}
          </p>
        </div>

        <h1 className="sgm-brand">
          SGM
          <span>Outreach</span>
        </h1>
        <p className="sgm-tagline">
          {pipelineEmpty
            ? "Pipeline quiet. Load targets, then this console lights up with live funnel truth — no invented metrics."
            : "Operator console for the outreach engine — pipeline truth from SQLite. LinkedIn stays paste-only."}
        </p>

        <div className="sgm-cta-row">
          <button
            type="button"
            className="sgm-kill"
            data-paused={snap.paused ? "true" : "false"}
            disabled={busy || dbMissing}
            onClick={() => void toggleKill()}
          >
            {snap.paused ? "Resume sends" : "Arm kill switch"}
          </button>
          <button type="button" className="sgm-btn" onClick={() => void refresh()}>
            Refresh
          </button>
          {error ? (
            <span className="sgm-live-meta" style={{ color: "var(--sgm-danger)" }}>
              {error}
            </span>
          ) : null}
        </div>
      </header>

      {pipelineEmpty ? (
        <section className="sgm-zero" aria-label="Empty pipeline">
          <div className="sgm-zero-glow" aria-hidden="true" />
          <p className="sgm-zero-kicker">Stage clear</p>
          <h2 className="sgm-zero-title">Ready when you are</h2>
          <p className="sgm-zero-copy">
            {dbMissing
              ? "No outreach.sqlite yet. Run the CLI once and this page binds to real counts."
              : "Database is online with zero leads. Ingest a Sales Nav CSV or add a company to wake the funnel."}
          </p>
          <pre className="sgm-zero-cli">{`sgm-outreach status
sgm-outreach ingest --source salesnav --inbox ./inbox
sgm-outreach add-company --name "Acme Audio" --domain acme.audio --channel linkedin`}</pre>
        </section>
      ) : null}

      <section className="sgm-section" aria-label="Pipeline metrics">
        <div className="sgm-section-head">
          <h2>Signal strip</h2>
          <p>updated {relativeTime(snap.generated_at)}</p>
        </div>
        <div className="sgm-metrics">
          <div className="sgm-metric">
            <span className="label">Companies</span>
            <span className="value">{snap.totals.companies}</span>
          </div>
          <div className="sgm-metric">
            <span className="label">Contacts</span>
            <span className="value">{snap.totals.contacts}</span>
          </div>
          <div className="sgm-metric" data-accent="phosphor">
            <span className="label">Leads</span>
            <span className="value">{snap.totals.leads}</span>
          </div>
          <div className="sgm-metric">
            <span className="label">Drafts</span>
            <span className="value">{snap.totals.drafts}</span>
          </div>
          <div className="sgm-metric" data-accent="amber">
            <span className="label">Pending</span>
            <span className="value">{pendingCount}</span>
          </div>
          <div className="sgm-metric" data-accent={snap.paused ? "danger" : undefined}>
            <span className="label">Sent+</span>
            <span className="value">{sentCount}</span>
          </div>
          <div className="sgm-metric">
            <span className="label">Suppress</span>
            <span className="value">{snap.totals.suppressions}</span>
          </div>
        </div>
      </section>

      <section className="sgm-section" aria-label="Pipeline funnel">
        <div className="sgm-section-head">
          <h2>Funnel by state</h2>
          <p>width ∝ count · empty stages stay flat</p>
        </div>
        <div className="sgm-funnel">
          {snap.funnel.map((stage, i) => {
            const pct = Math.max((stage.count / maxFunnel) * 100, stage.count > 0 ? 2 : 0);
            return (
              <div className="sgm-funnel-row" key={stage.state}>
                <div className="sgm-funnel-label">{formatState(stage.state)}</div>
                <div className="sgm-funnel-track">
                  <div
                    className="sgm-funnel-fill"
                    data-empty={stage.count === 0 ? "true" : "false"}
                    style={{
                      width: `${pct}%`,
                      animationDelay: `${0.04 * i}s`,
                      opacity: stage.count === 0 ? 0.25 : 1,
                    }}
                  />
                </div>
                <div className="sgm-funnel-count">{stage.count}</div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="sgm-split sgm-section">
        <section aria-label="Pending approval queue">
          <div className="sgm-section-head">
            <h2>Approval queue</h2>
            <p>{pendingCount} awaiting human</p>
          </div>
          <div className="sgm-queue">
            {snap.pending_approval.length === 0 ? (
              <div className="sgm-empty">
                <strong>Queue clear.</strong> Nothing in PENDING_APPROVAL.
                {snap.totals.leads > 0
                  ? " Draft + score leads to fill this lane."
                  : " Ingest when ready — empty still looks honest."}
              </div>
            ) : (
              snap.pending_approval.map((item) => (
                <article className="sgm-queue-item" key={item.id}>
                  <div className="sgm-queue-top">
                    <div className="sgm-queue-name">
                      {item.contact_name ?? "Unknown contact"}
                    </div>
                    <span className="sgm-chip" data-tone="warn">
                      score {item.score}
                    </span>
                  </div>
                  <div className="sgm-queue-meta">
                    {item.company_name ?? "—"}
                    {item.company_domain ? ` · ${item.company_domain}` : ""}
                    {" · "}
                    {item.channel}
                    {" · "}
                    {relativeTime(item.updated_at)}
                  </div>
                  {item.subject ? (
                    <p className="sgm-body-preview">
                      <strong style={{ color: "var(--sgm-ink)" }}>{item.subject}</strong>
                      {item.body_preview ? ` — ${item.body_preview}` : null}
                    </p>
                  ) : item.body_preview ? (
                    <p className="sgm-body-preview">{item.body_preview}</p>
                  ) : null}
                </article>
              ))
            )}
          </div>
        </section>

        <section aria-label="LinkedIn paste queue">
          <div className="sgm-section-head">
            <h2>LinkedIn paste</h2>
            <p>copy body → paste into LinkedIn</p>
          </div>
          <div className="sgm-queue">
            {snap.linkedin_paste_queue.length === 0 && snap.linkedin_warming.length === 0 ? (
              <div className="sgm-empty">
                <strong>No LinkedIn leads yet.</strong> Sales Nav ingest or{" "}
                <code>sgm-outreach add-company --channel linkedin</code> will land here.
              </div>
            ) : null}

            {snap.linkedin_paste_queue.map((item) => (
              <article className="sgm-queue-item" key={item.id}>
                <div className="sgm-queue-top">
                  <div className="sgm-queue-name">
                    {item.contact_name ?? "LinkedIn contact"}
                  </div>
                  <span
                    className="sgm-chip"
                    data-tone={item.ready_to_paste ? "ready" : undefined}
                  >
                    {formatState(item.state)}
                  </span>
                </div>
                <div className="sgm-queue-meta">
                  {item.company_name ?? "—"}
                  {item.contact_role ? ` · ${item.contact_role}` : ""}
                </div>
                {item.body ? (
                  <p className="sgm-body-preview">
                    {item.body.length > 220 ? `${item.body.slice(0, 219)}…` : item.body}
                  </p>
                ) : (
                  <p className="sgm-body-preview">No draft body yet — run draft stage first.</p>
                )}
                <div className="sgm-paste-actions">
                  {item.body ? (
                    <button
                      type="button"
                      className="sgm-btn"
                      onClick={() => void onCopy(item.id, item.body!)}
                    >
                      {copiedId === item.id ? "Copied" : "Copy message"}
                    </button>
                  ) : null}
                  {item.linkedin_url ? (
                    <a
                      className="sgm-btn"
                      href={item.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open profile
                    </a>
                  ) : null}
                </div>
              </article>
            ))}

            {snap.linkedin_warming.length > 0 ? (
              <>
                <div
                  className="sgm-queue-meta"
                  style={{ padding: "1.1rem 0 0.35rem", letterSpacing: "0.12em" }}
                >
                  WARMING · not paste-ready
                </div>
                {snap.linkedin_warming.map((item) => (
                  <article className="sgm-queue-item" key={item.id}>
                    <div className="sgm-queue-top">
                      <div className="sgm-queue-name">
                        {item.contact_name ?? "LinkedIn contact"}
                      </div>
                      <span className="sgm-chip">{formatState(item.state)}</span>
                    </div>
                    <div className="sgm-queue-meta">
                      {item.company_name ?? "—"}
                      {item.linkedin_url ? " · profile linked" : " · no URL"}
                    </div>
                    <div className="sgm-paste-actions">
                      {item.linkedin_url ? (
                        <a
                          className="sgm-btn"
                          href={item.linkedin_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Open profile
                        </a>
                      ) : null}
                    </div>
                  </article>
                ))}
              </>
            ) : null}
          </div>
        </section>
      </div>

      <footer className="sgm-footer">
        <span className="sgm-source" data-source={snap.source}>
          source: {snap.source}
        </span>
        <span title={snap.db_path}>db: {snap.db_path}</span>
        <span>
          CLI: <code>sgm-outreach status | pause | resume</code>
        </span>
      </footer>
    </div>
  );
}
