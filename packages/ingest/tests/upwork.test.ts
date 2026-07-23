import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  matchesUpworkKeywords,
  parseUpworkRss,
} from "../src/sources/upwork-rss.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

describe("upwork-rss", () => {
  it("filters keyword-matching jobs and emits upwork channel", () => {
    const xml = readFileSync(join(fixtures, "upwork-sample.xml"), "utf8");
    const candidates = parseUpworkRss(xml);
    expect(candidates).toHaveLength(2);
    expect(candidates.every((c) => c.channel === "upwork")).toBe(true);
    expect(candidates.every((c) => c.domain.endsWith(".upwork.local"))).toBe(
      true,
    );
    expect(matchesUpworkKeywords("need a logo")).toBe(false);
    expect(matchesUpworkKeywords("AUv3 real-time DSP")).toBe(true);
  });
});
