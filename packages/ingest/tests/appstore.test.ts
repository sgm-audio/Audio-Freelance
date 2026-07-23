import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseAppStoreResults, sellerIsSmall } from "../src/sources/appstore-auv3.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

describe("appstore-auv3", () => {
  it("parses fixture JSON into small music-tech sellers with domains", () => {
    const json = JSON.parse(
      readFileSync(join(fixtures, "appstore-sample.json"), "utf8"),
    ) as unknown;
    const candidates = parseAppStoreResults(json);
    const domains = candidates.map((c) => c.domain).sort();
    expect(domains).toEqual(["indiedsp.dev", "quietcircuits.com"]);
    expect(candidates.every((c) => c.source === "appstore-auv3")).toBe(true);
    expect(candidates.every((c) => c.segment === "ios-audio")).toBe(true);
  });

  it("excludes big sellers", () => {
    expect(sellerIsSmall("Apple", 1)).toBe(false);
    expect(sellerIsSmall("Quiet Circuits", 2)).toBe(true);
  });
});
