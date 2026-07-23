import type { OutreachDb } from "@sgm-outreach/core";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadIngestConfig, type IngestConfig } from "./config.js";
import { ingestAppStore } from "./sources/appstore-auv3.js";
import { ingestJobboards } from "./sources/jobboards.js";
import {
  ingestSalesNavInbox,
  parseSalesNavCsv,
} from "./sources/salesnav-csv.js";
import { ingestUpworkRss } from "./sources/upwork-rss.js";
import type {
  IngestCandidate,
  IngestSource,
  IngestWriteResult,
} from "./types.js";
import { writeCandidates } from "./write.js";

function emptyWrite(): IngestWriteResult {
  return {
    companies_created: 0,
    companies_deduped: 0,
    contacts_created: 0,
    leads_created: 0,
    skipped_invalid: 0,
  };
}

function mergeWrite(a: IngestWriteResult, b: IngestWriteResult): IngestWriteResult {
  return {
    companies_created: a.companies_created + b.companies_created,
    companies_deduped: a.companies_deduped + b.companies_deduped,
    contacts_created: a.contacts_created + b.contacts_created,
    leads_created: a.leads_created + b.leads_created,
    skipped_invalid: a.skipped_invalid + b.skipped_invalid,
  };
}

const ALL_SOURCES = [
  "appstore-auv3",
  "salesnav-csv",
  "upwork-rss",
  "jobboards",
] as const satisfies readonly IngestSource[];

export interface RunIngestOptions {
  db: OutreachDb;
  sources?: IngestSource[];
  config?: IngestConfig;
  configPath?: string;
  live?: boolean;
  fixtures?: {
    salesnavCsv?: string;
    upworkXml?: string;
    soundlisterHtml?: string;
    tapHtml?: string;
    appstoreJson?: unknown;
  };
  fetchImpl?: typeof fetch;
}

export interface RunIngestResult {
  by_source: Record<string, IngestWriteResult & { candidates: number }>;
  totals: IngestWriteResult;
}

export async function collectCandidates(
  source: IngestSource,
  options: RunIngestOptions,
  config: IngestConfig,
): Promise<IngestCandidate[]> {
  const fx = options.fixtures;
  switch (source) {
    case "appstore-auv3": {
      if (fx?.appstoreJson !== undefined) {
        const { parseAppStoreResults } = await import(
          "./sources/appstore-auv3.js"
        );
        return parseAppStoreResults(fx.appstoreJson);
      }
      return ingestAppStore({
        ...(config.appstore_terms ? { terms: config.appstore_terms } : {}),
        ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
      });
    }
    case "salesnav-csv": {
      if (fx?.salesnavCsv !== undefined) {
        return parseSalesNavCsv(fx.salesnavCsv);
      }
      return ingestSalesNavInbox(resolve(config.inbox_dir));
    }
    case "upwork-rss": {
      if (fx?.upworkXml !== undefined) {
        return ingestUpworkRss({ urls: [], fixtureXml: fx.upworkXml });
      }
      return ingestUpworkRss({
        urls: config.upwork_rss_urls,
        ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
      });
    }
    case "jobboards": {
      return ingestJobboards({
        live: options.live === true,
        ...(fx?.soundlisterHtml !== undefined
          ? { soundlisterHtml: fx.soundlisterHtml }
          : {}),
        ...(fx?.tapHtml !== undefined ? { tapHtml: fx.tapHtml } : {}),
        ...(config.jobboards.soundlister_url
          ? { soundlisterUrl: config.jobboards.soundlister_url }
          : {}),
        ...(config.jobboards.tap_url ? { tapUrl: config.jobboards.tap_url } : {}),
      });
    }
    case "manual":
      return [];
    default: {
      const _exhaustive: never = source;
      return _exhaustive;
    }
  }
}

export async function runIngest(
  options: RunIngestOptions,
): Promise<RunIngestResult> {
  const config = options.config ?? loadIngestConfig(options.configPath);
  const sources = options.sources?.length
    ? options.sources.filter((s) => s !== "manual")
    : [...ALL_SOURCES];
  const by_source: RunIngestResult["by_source"] = {};
  let totals = emptyWrite();
  for (const source of sources) {
    const candidates = await collectCandidates(source, options, config);
    const written = writeCandidates(options.db, candidates);
    by_source[source] = { ...written, candidates: candidates.length };
    totals = mergeWrite(totals, written);
  }
  return { by_source, totals };
}

/** Convenience: load a fixture file from disk (absolute or cwd-relative). */
export function readFixture(path: string): string {
  return readFileSync(resolve(path), "utf8");
}
