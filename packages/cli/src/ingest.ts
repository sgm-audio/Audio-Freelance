import { openAndMigrate, type Channel } from "@sgm-outreach/core";
import {
  addCompany,
  loadIngestConfig,
  runIngest,
  type IngestSource,
} from "@sgm-outreach/ingest";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { defaultDbPath } from "./status.js";

const SOURCE_ALIASES: Record<string, IngestSource> = {
  appstore: "appstore-auv3",
  "appstore-auv3": "appstore-auv3",
  salesnav: "salesnav-csv",
  "salesnav-csv": "salesnav-csv",
  upwork: "upwork-rss",
  "upwork-rss": "upwork-rss",
  jobboards: "jobboards",
};

function parseFlag(argv: string[], name: string): string | undefined {
  const idx = argv.indexOf(name);
  if (idx < 0) return undefined;
  return argv[idx + 1];
}

function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(name);
}

export async function runIngestCommand(argv: string[]): Promise<void> {
  const dbPath = parseFlag(argv, "--db") ?? defaultDbPath();
  const sourceArg = parseFlag(argv, "--source") ?? "all";
  const live = hasFlag(argv, "--live");
  const configPath = parseFlag(argv, "--config");
  const inbox = parseFlag(argv, "--inbox");
  const fixtureDir = parseFlag(argv, "--fixtures");
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = openAndMigrate(dbPath);
  try {
    const config = loadIngestConfig(configPath);
    if (inbox) config.inbox_dir = resolve(inbox);
    let sources: IngestSource[] | undefined;
    if (sourceArg !== "all") {
      const mapped = SOURCE_ALIASES[sourceArg];
      if (!mapped) {
        throw new Error(
          `Unknown source: ${sourceArg}. Use appstore|salesnav|upwork|jobboards|all`,
        );
      }
      sources = [mapped];
    }
    const fixtures =
      fixtureDir !== undefined
        ? {
            salesnavCsv: readFileSync(
              resolve(fixtureDir, "salesnav-sample.csv"),
              "utf8",
            ),
            upworkXml: readFileSync(
              resolve(fixtureDir, "upwork-sample.xml"),
              "utf8",
            ),
            soundlisterHtml: readFileSync(
              resolve(fixtureDir, "soundlister-jobs.html"),
              "utf8",
            ),
            tapHtml: readFileSync(resolve(fixtureDir, "tap-jobs.html"), "utf8"),
            appstoreJson: JSON.parse(
              readFileSync(resolve(fixtureDir, "appstore-sample.json"), "utf8"),
            ) as unknown,
          }
        : undefined;
    const result = await runIngest({
      db,
      config,
      live,
      ...(sources ? { sources } : {}),
      ...(fixtures ? { fixtures } : {}),
    });
    console.log("SGM Outreach — ingest complete");
    console.log(`db: ${dbPath}`);
    console.log(`live jobboards: ${live ? "yes" : "no"}`);
    for (const [src, s] of Object.entries(result.by_source)) {
      console.log(
        `  ${src}: candidates=${s.candidates} created=${s.companies_created} deduped=${s.companies_deduped} leads=${s.leads_created}`,
      );
    }
    console.log(
      `totals: companies_created=${result.totals.companies_created} deduped=${result.totals.companies_deduped} leads=${result.totals.leads_created} skipped=${result.totals.skipped_invalid}`,
    );
    if (
      sourceArg === "all" ||
      sourceArg === "upwork" ||
      sourceArg === "upwork-rss"
    ) {
      if (config.upwork_rss_urls.length === 0 && !fixtures) {
        console.log(
          "note: no upwork_rss_urls in config/ingest.json — skipped live RSS (add URLs or use --fixtures)",
        );
      }
    }
  } finally {
    db.close();
  }
}

export function runAddCompanyCommand(argv: string[]): void {
  const name = parseFlag(argv, "--name");
  const domain = parseFlag(argv, "--domain");
  const segment = parseFlag(argv, "--segment") ?? "music-tech";
  const tierRaw = parseFlag(argv, "--tier");
  const channel = (parseFlag(argv, "--channel") ?? "email") as Channel;
  const dbPath = parseFlag(argv, "--db") ?? defaultDbPath();
  if (!name || !domain) {
    console.error(
      "Usage: sgm-outreach add-company --name <name> --domain <domain> [--segment ...] [--tier N] [--channel email|linkedin|upwork]",
    );
    process.exit(1);
  }
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = openAndMigrate(dbPath);
  try {
    const result = addCompany(db, {
      name,
      domain,
      segment,
      tier: tierRaw ? Number(tierRaw) : 1,
      channel,
    });
    console.log(
      result.created
        ? `company created: ${name} (${domain}) id=${result.company_id}`
        : `company exists: ${domain} id=${result.company_id}`,
    );
    console.log(
      result.lead_created ? "lead: NEW created" : "lead: already present",
    );
  } finally {
    db.close();
  }
}
