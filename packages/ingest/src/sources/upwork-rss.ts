import { z } from "zod";
import type { IngestCandidate } from "../types.js";

export const UPWORK_KEYWORDS = [
  "dsp",
  "audio",
  "c++",
  "real-time",
  "realtime",
  "real time",
  "vst",
  "auv3",
  "audio unit",
  "plugin",
  "juce",
] as const;

const RssItemSchema = z.object({
  title: z.string(),
  link: z.string().optional(),
  description: z.string().optional(),
  guid: z.string().optional(),
});

function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function tagContents(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    out.push(decodeXml((m[1] ?? "").trim()));
  }
  return out;
}

export function matchesUpworkKeywords(text: string): boolean {
  const lower = text.toLowerCase();
  const strong = [
    "dsp",
    "c++",
    "vst",
    "auv3",
    "juce",
    "real-time",
    "realtime",
    "real time",
    "audio unit",
  ];
  if (strong.some((k) => lower.includes(k))) return true;
  if (
    /\b(audio|plugin)\b/.test(lower) &&
    /\b(engineer|developer|dev|c\+\+|rust|code|engine)\b/.test(lower)
  ) {
    return true;
  }
  return false;
}

export function parseUpworkRss(xml: string): IngestCandidate[] {
  const itemsXml = tagContents(xml, "item");
  const atomEntries =
    itemsXml.length > 0 ? itemsXml : tagContents(xml, "entry");
  const out: IngestCandidate[] = [];
  const seen = new Set<string>();
  for (const block of atomEntries) {
    const title = tagContents(block, "title")[0] ?? "";
    const linkRaw =
      tagContents(block, "link")[0] ??
      (block.match(/<link[^>]+href="([^"]+)"/i)?.[1] ?? "");
    const description =
      tagContents(block, "description")[0] ??
      tagContents(block, "summary")[0] ??
      "";
    const guid = tagContents(block, "guid")[0] ?? linkRaw ?? title;
    const parsed = RssItemSchema.safeParse({
      title,
      link: linkRaw || undefined,
      description,
      guid,
    });
    if (!parsed.success || !parsed.data.title) continue;
    const haystack = `${parsed.data.title}\n${parsed.data.description ?? ""}`;
    if (!matchesUpworkKeywords(haystack)) continue;
    const slug = (parsed.data.guid || parsed.data.title)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48);
    const domain = `job-${slug || "unknown"}.upwork.local`;
    if (seen.has(domain)) continue;
    seen.add(domain);
    out.push({
      name: parsed.data.title.slice(0, 120),
      domain,
      segment: "upwork-contract",
      source: "upwork-rss",
      channel: "upwork",
      tier: 1,
      meta: {
        link: parsed.data.link ?? null,
        guid: parsed.data.guid ?? null,
      },
    });
  }
  return out;
}

export async function fetchRss(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`RSS HTTP ${res.status} for ${url}`);
  return res.text();
}

export async function ingestUpworkRss(options: {
  urls: readonly string[];
  fixtureXml?: string;
  fetchImpl?: typeof fetch;
}): Promise<IngestCandidate[]> {
  if (options.fixtureXml) {
    return parseUpworkRss(options.fixtureXml);
  }
  const seen = new Set<string>();
  const out: IngestCandidate[] = [];
  for (const url of options.urls) {
    if (!url.trim()) continue;
    const xml = await fetchRss(url, options.fetchImpl);
    for (const c of parseUpworkRss(xml)) {
      if (seen.has(c.domain)) continue;
      seen.add(c.domain);
      out.push(c);
    }
  }
  return out;
}
