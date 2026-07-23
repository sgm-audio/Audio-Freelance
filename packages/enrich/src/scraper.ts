import { robotsAllows } from "./robots.js";

export const OUTREACH_USER_AGENT =
  "SGM-OutreachBot/0.1 (+https://sgmstudios.ca; research)";

const ROBOTS_USER_AGENT = "SGM-OutreachBot";
const PAGE_PATHS = ["/", "/about", "/contact", "/blog"];

export interface ScrapedPage {
  url: string;
  path: string;
  html: string;
  title?: string;
}

export interface ScraperClock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export interface ScrapeCompanySiteOptions {
  domain: string;
  fetchPage?: (url: string) => Promise<string>;
  robotsTxt?: string;
  clock?: ScraperClock;
}

const defaultClock: ScraperClock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

function siteOrigin(domain: string): string {
  const raw = /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
  const url = new URL(raw);
  return `${url.protocol}//${url.host}`;
}

function titleFromHtml(html: string): string | undefined {
  const title = html
    .match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    ?.replace(/\s+/g, " ")
    .trim();
  return title || undefined;
}

async function loadRobots(origin: string): Promise<string> {
  try {
    const response = await fetch(`${origin}/robots.txt`, {
      headers: { "user-agent": OUTREACH_USER_AGENT },
    });
    return response.ok ? await response.text() : "";
  } catch {
    return "";
  }
}

export async function scrapeCompanySite(
  options: ScrapeCompanySiteOptions,
): Promise<ScrapedPage[]> {
  const origin = siteOrigin(options.domain);
  const clock = options.clock ?? defaultClock;
  const fetchedRobots = options.robotsTxt === undefined;
  const robotsTxt = options.robotsTxt ?? (await loadRobots(origin));
  let closeBrowser: (() => Promise<void>) | undefined;
  let fetchPage = options.fetchPage;
  if (!fetchPage) {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ userAgent: OUTREACH_USER_AGENT });
    fetchPage = async (url: string) => {
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      return page.content();
    };
    closeBrowser = () => browser.close();
  }
  const pages: ScrapedPage[] = [];
  let lastRequestAt = fetchedRobots ? clock.now() : undefined;
  try {
    for (const path of PAGE_PATHS) {
      if (pages.length === 3) break;
      if (!robotsAllows(robotsTxt, path, ROBOTS_USER_AGENT)) continue;
      if (lastRequestAt !== undefined) {
        const wait = 1000 - (clock.now() - lastRequestAt);
        if (wait > 0) await clock.sleep(wait);
      }
      lastRequestAt = clock.now();
      const url = new URL(path, origin).toString();
      try {
        const html = await fetchPage(url);
        const title = titleFromHtml(html);
        pages.push({ url, path, html, ...(title ? { title } : {}) });
      } catch {
        // A missing optional page should not discard successful pages.
      }
    }
  } finally {
    if (closeBrowser) await closeBrowser();
  }
  return pages;
}
