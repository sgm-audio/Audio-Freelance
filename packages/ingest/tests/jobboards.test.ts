import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  parseJobboardHtml,
  robotsAllows,
} from "../src/sources/jobboards.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

describe("jobboards", () => {
  it("keeps contract/freelance posts only from fixtures", () => {
    const sound = parseJobboardHtml(
      readFileSync(join(fixtures, "soundlister-jobs.html"), "utf8"),
      "soundlister",
    );
    const tap = parseJobboardHtml(
      readFileSync(join(fixtures, "tap-jobs.html"), "utf8"),
      "tap",
    );
    expect(sound.map((c) => c.domain).sort()).toEqual([
      "echoroomaudio.com",
      "modularbits.io",
    ]);
    expect(tap.map((c) => c.domain)).toEqual(["tapstudiolabs.com"]);
    expect([...sound, ...tap].every((c) => c.source.startsWith("jobboards:"))).toBe(
      true,
    );
  });

  it("respects robots.txt disallow", () => {
    const robots = `User-agent: *\nDisallow: /jobs/\nAllow: /jobs/public\n`;
    expect(robotsAllows(robots, "/jobs/secret")).toBe(false);
    expect(robotsAllows(robots, "/jobs/public/list")).toBe(true);
    expect(robotsAllows(robots, "/about")).toBe(true);
  });
});
