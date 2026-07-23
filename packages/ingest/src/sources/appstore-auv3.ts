import { normalizeDomain } from "@sgm-outreach/core";
import { z } from "zod";
import type { IngestCandidate } from "../types.js";

const ItunesResultSchema = z.object({
  trackName: z.string().optional(),
  artistName: z.string().optional(),
  sellerName: z.string().optional(),
  sellerUrl: z.union([z.string().url(), z.literal("")]).optional(),
  primaryGenreName: z.string().optional(),
  genres: z.array(z.string()).optional(),
  bundleId: z.string().optional(),
});

type ItunesResult = z.infer<typeof ItunesResultSchema>;

const ItunesResponseSchema = z.object({
  resultCount: z.number().int().nonnegative(),
  results: z.array(ItunesResultSchema),
});

/** Keywords that signal AUv3 / music-tech relevance. */
export const AUV3_TERMS = [
  "AUv3",
  "Audio Unit",
  "iOS synth",
  "guitar amp AUv3",
  "music production iOS",
] as const;

const BIG_SELLERS = new Set(
  [
    "apple",
    "google",
    "microsoft",
    "amazon",
    "meta",
    "adobe",
    "yamaha",
    "roland",
    "native instruments",
    "native instruments gmbh",
    "steinberg",
    "avid",
    "ableton",
    "spotify",
  ].map((s) => s.toLowerCase()),
);

const MAX_APPS_PER_SELLER = 8;

export function isMusicSoftware(r: ItunesResult): boolean {
  const genres = [
    ...(r.genres ?? []),
    r.primaryGenreName ?? "",
    r.trackName ?? "",
    r.bundleId ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return (
    genres.includes("music") ||
    genres.includes("audio") ||
    genres.includes("auv3") ||
    genres.includes("audio unit") ||
    genres.includes("synth")
  );
}

export function sellerIsSmall(
  seller: string,
  appCount: number,
  maxApps = MAX_APPS_PER_SELLER,
): boolean {
  if (BIG_SELLERS.has(seller.trim().toLowerCase())) return false;
  return appCount <= maxApps;
}

/**
 * Pure transform: iTunes Search JSON → company candidates.
 * Dedupes by domain within the batch; prefers sellerUrl as domain.
 */
export function parseAppStoreResults(
  json: unknown,
  source = "appstore-auv3",
): IngestCandidate[] {
  const parsed = ItunesResponseSchema.safeParse(json);
  if (!parsed.success) return [];
  const bySeller = new Map<string, ItunesResult[]>();
  for (const r of parsed.data.results) {
    if (!isMusicSoftware(r)) continue;
    const seller = (r.sellerName ?? r.artistName ?? "").trim();
    if (!seller) continue;
    const list = bySeller.get(seller) ?? [];
    list.push(r);
    bySeller.set(seller, list);
  }
  const out: IngestCandidate[] = [];
  const seenDomains = new Set<string>();
  for (const [seller, apps] of bySeller) {
    if (!sellerIsSmall(seller, apps.length)) continue;
    const withUrl = apps.find((a) => a.sellerUrl && a.sellerUrl.length > 0);
    const domain = withUrl?.sellerUrl
      ? normalizeDomain(withUrl.sellerUrl)
      : null;
    if (!domain || seenDomains.has(domain)) continue;
    seenDomains.add(domain);
    out.push({
      name: seller,
      domain,
      segment: "ios-audio",
      source,
      channel: "email",
      tier: 1,
      meta: {
        app_count: apps.length,
        sample_app: apps[0]?.trackName ?? null,
      },
    });
  }
  return out;
}

export async function fetchItunesSearch(
  term: string,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", term);
  url.searchParams.set("media", "software");
  url.searchParams.set("entity", "software");
  url.searchParams.set("limit", "200");
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`iTunes Search HTTP ${res.status} for ${term}`);
  return res.json();
}

export async function ingestAppStore(options?: {
  terms?: readonly string[];
  fetchImpl?: typeof fetch;
}): Promise<IngestCandidate[]> {
  const terms = options?.terms ?? AUV3_TERMS;
  const fetchImpl = options?.fetchImpl ?? fetch;
  const merged: IngestCandidate[] = [];
  const seen = new Set<string>();
  for (const term of terms) {
    const json = await fetchItunesSearch(term, fetchImpl);
    for (const c of parseAppStoreResults(json)) {
      if (seen.has(c.domain)) continue;
      seen.add(c.domain);
      merged.push(c);
    }
  }
  return merged;
}
