import type { IngestCandidate } from "../types.js";

const CONTRACT_FLAGS =
  /\b(contract|freelance|freelancer|contractor|part[- ]?time|remote contract)\b/i;

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

export function parseJobboardHtml(
  html: string,
  board: "soundlister" | "tap",
): IngestCandidate[] {
  const cards = [
    ...html.matchAll(
      /<(?:article|div|li)([^>]*class="[^"]*job-card[^"]*"[^>]*)>([\s\S]*?)<\/(?:article|div|li)>/gi,
    ),
  ];
  const out: IngestCandidate[] = [];
  const seen = new Set<string>();
  for (const m of cards) {
    const attrs = m[1] ?? "";
    const block = m[2] ?? "";
    const title = decodeHtml(
      block.match(
        /<(?:h2|h3|a)[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\//i,
      )?.[1] ??
        block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1] ??
        "",
    ).replace(/<[^>]+>/g, "");
    const company = decodeHtml(
      attrs.match(/data-company="([^"]+)"/i)?.[1] ??
        block.match(/class="[^"]*company[^"]*"[^>]*>([\s\S]*?)</i)?.[1] ??
        "",
    ).replace(/<[^>]+>/g, "");
    const domainRaw =
      attrs.match(/data-domain="([^"]+)"/i)?.[1] ??
      block.match(/data-domain="([^"]+)"/i)?.[1] ??
      "";
    const flags =
      attrs.match(/data-flags="([^"]+)"/i)?.[1] ??
      block.match(/class="[^"]*flags?[^"]*"[^>]*>([\s\S]*?)</i)?.[1] ??
      `${attrs} ${block}`;
    const url =
      block.match(/href="(https?:\/\/[^"]+)"/i)?.[1] ??
      `https://${board}.example/job`;
    if (!title || !company || !domainRaw) continue;
    if (!CONTRACT_FLAGS.test(flags) && !CONTRACT_FLAGS.test(title)) continue;
    const domain = domainRaw.toLowerCase().replace(/^www\./, "");
    if (seen.has(domain)) continue;
    seen.add(domain);
    out.push({
      name: company,
      domain,
      segment: "audio-jobs",
      source: `jobboards:${board}`,
      channel: "email",
      tier: 1,
      meta: { title, url, board },
    });
  }
  return out;
}

export function isContractJob(titleOrFlags: string): boolean {
  return CONTRACT_FLAGS.test(titleOrFlags);
}

/** Minimal robots.txt allow check for a path. */
export function robotsAllows(
  robotsTxt: string,
  path: string,
  ua = "*",
): boolean {
  const lines = robotsTxt.split(/\r?\n/).map((l) => l.trim());
  let applies = false;
  let allowed = true;
  for (const line of lines) {
    if (!line || line.startsWith("#")) continue;
    const uaMatch = line.match(/^user-agent:\s*(.+)$/i);
    if (uaMatch) {
      const agent = uaMatch[1]?.trim() ?? "";
      applies = agent === "*" || agent.toLowerCase() === ua.toLowerCase();
      continue;
    }
    if (!applies) continue;
    const dis = line.match(/^disallow:\s*(.*)$/i);
    if (dis) {
      const rule = dis[1]?.trim() ?? "";
      if (rule === "") continue;
      if (path.startsWith(rule)) allowed = false;
    }
    const al = line.match(/^allow:\s*(.*)$/i);
    if (al) {
      const rule = al[1]?.trim() ?? "";
      if (rule && path.startsWith(rule)) allowed = true;
    }
  }
  return allowed;
}

export async function fetchWithRateLimit(
  url: string,
  options?: {
    fetchImpl?: typeof fetch;
    minIntervalMs?: number;
    lastAt?: { t: number };
  },
): Promise<string> {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const minIntervalMs = options?.minIntervalMs ?? 1000;
  const lastAt = options?.lastAt ?? { t: 0 };
  const wait = minIntervalMs - (Date.now() - lastAt.t);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastAt.t = Date.now();
  const robotsUrl = new URL("/robots.txt", url).toString();
  try {
    const robotsRes = await fetchImpl(robotsUrl);
    if (robotsRes.ok) {
      const robotsTxt = await robotsRes.text();
      const path = new URL(url).pathname;
      if (!robotsAllows(robotsTxt, path)) {
        throw new Error(`robots.txt disallows ${path}`);
      }
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("robots.txt")) throw e;
  }
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      userAgent:
        "SGM-OutreachBot/0.1 (+https://sgmstudios.ca; research)",
    });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    return await page.content();
  } finally {
    await browser.close();
  }
}

export async function ingestJobboards(options: {
  live?: boolean;
  soundlisterHtml?: string;
  tapHtml?: string;
  soundlisterUrl?: string;
  tapUrl?: string;
}): Promise<IngestCandidate[]> {
  const out: IngestCandidate[] = [];
  const seen = new Set<string>();
  const push = (items: IngestCandidate[]) => {
    for (const c of items) {
      if (seen.has(c.domain)) continue;
      seen.add(c.domain);
      out.push(c);
    }
  };
  if (options.live) {
    const lastAt = { t: 0 };
    if (options.soundlisterUrl) {
      const html = await fetchWithRateLimit(options.soundlisterUrl, { lastAt });
      push(parseJobboardHtml(html, "soundlister"));
    }
    if (options.tapUrl) {
      const html = await fetchWithRateLimit(options.tapUrl, { lastAt });
      push(parseJobboardHtml(html, "tap"));
    }
  } else {
    if (options.soundlisterHtml) {
      push(parseJobboardHtml(options.soundlisterHtml, "soundlister"));
    }
    if (options.tapHtml) {
      push(parseJobboardHtml(options.tapHtml, "tap"));
    }
  }
  return out;
}
