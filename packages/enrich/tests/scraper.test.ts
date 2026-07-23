import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { scrapeCompanySite } from "../src/scraper.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

describe("site scraper", () => {
  it("respects robots, caps pages, and rate-limits requests", async () => {
    const requested: string[] = [];
    const sleeps: number[] = [];
    let now = 0;
    const pages = await scrapeCompanySite({
      domain: "example.test",
      robotsTxt: readFileSync(join(fixtures, "robots-disallow.txt"), "utf8"),
      fetchPage: async (url) => {
        requested.push(new URL(url).pathname);
        return `<html><title>${url}</title><body>fixture</body></html>`;
      },
      clock: {
        now: () => now,
        sleep: async (ms) => {
          sleeps.push(ms);
          now += ms;
        },
      },
    });

    expect(pages.map((page) => page.path)).toEqual(["/", "/about", "/blog"]);
    expect(requested).toEqual(["/", "/about", "/blog"]);
    expect(sleeps).toEqual([1000, 1000]);
  });
});
