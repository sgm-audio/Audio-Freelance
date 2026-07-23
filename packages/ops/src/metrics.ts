import type { OutreachDb } from "@sgm-outreach/core";

export interface MetricsRow {
  day: string;
  segment: string;
  sent: number;
  replies: number;
  bounces: number;
}

export interface MetricsQuery {
  /** Lookback window in days (inclusive of today UTC). Default 30. */
  days?: number;
  segment?: string;
}

/**
 * Aggregate SENT / REPLIED / BOUNCED transitions by UTC day and company segment.
 * Sourced from the events table (authoritative audit log).
 */
export function collectMetrics(
  db: OutreachDb,
  query: MetricsQuery = {},
): MetricsRow[] {
  const days = query.days ?? 30;
  if (!Number.isInteger(days) || days < 1) {
    throw new Error(`metrics --days must be a positive integer, got ${days}`);
  }
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (days - 1));
  const sinceIso = since.toISOString();

  const params: unknown[] = [sinceIso];
  let segmentClause = "";
  if (query.segment) {
    segmentClause = "AND c.segment = ?";
    params.push(query.segment);
  }

  const rows = db
    .prepare(
      `SELECT
         substr(e.at, 1, 10) AS day,
         c.segment AS segment,
         SUM(CASE WHEN e.to_state = 'SENT' THEN 1 ELSE 0 END) AS sent,
         SUM(CASE WHEN e.to_state = 'REPLIED' THEN 1 ELSE 0 END) AS replies,
         SUM(CASE WHEN e.to_state = 'BOUNCED' THEN 1 ELSE 0 END) AS bounces
       FROM events e
       JOIN leads l ON l.id = e.lead_id
       JOIN companies c ON c.id = l.company_id
       WHERE e.at >= ?
         AND e.to_state IN ('SENT', 'REPLIED', 'BOUNCED')
         ${segmentClause}
       GROUP BY day, segment
       ORDER BY day ASC, segment ASC`,
    )
    .all(...params) as Array<{
    day: string;
    segment: string;
    sent: number;
    replies: number;
    bounces: number;
  }>;

  return rows.map((r) => ({
    day: r.day,
    segment: r.segment,
    sent: Number(r.sent) || 0,
    replies: Number(r.replies) || 0,
    bounces: Number(r.bounces) || 0,
  }));
}

export function formatMetricsTable(rows: MetricsRow[]): string {
  const lines = [
    "day         segment              sent  replies  bounces",
    "----------  -------------------  ----  -------  -------",
  ];
  if (rows.length === 0) {
    lines.push("(no SENT/REPLIED/BOUNCED events in window)");
    return lines.join("\n");
  }
  for (const r of rows) {
    lines.push(
      `${r.day.padEnd(10)}  ${r.segment.padEnd(19)}  ${String(r.sent).padStart(4)}  ${String(r.replies).padStart(7)}  ${String(r.bounces).padStart(7)}`,
    );
  }
  const totals = rows.reduce(
    (acc, r) => {
      acc.sent += r.sent;
      acc.replies += r.replies;
      acc.bounces += r.bounces;
      return acc;
    },
    { sent: 0, replies: 0, bounces: 0 },
  );
  lines.push(
    `${"TOTAL".padEnd(10)}  ${"".padEnd(19)}  ${String(totals.sent).padStart(4)}  ${String(totals.replies).padStart(7)}  ${String(totals.bounces).padStart(7)}`,
  );
  return lines.join("\n");
}
