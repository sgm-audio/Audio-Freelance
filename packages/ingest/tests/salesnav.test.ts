import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseSalesNavCsv } from "../src/sources/salesnav-csv.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

describe("salesnav-csv", () => {
  it("parses fixture CSV and dedupes by domain", () => {
    const csv = readFileSync(join(fixtures, "salesnav-sample.csv"), "utf8");
    const candidates = parseSalesNavCsv(csv);
    expect(candidates).toHaveLength(3);
    expect(candidates.map((c) => c.domain).sort()).toEqual([
      "portamentosoft.com",
      "tinyauv3.co",
      "waveformlabs.dev",
    ]);
    const wave = candidates.find((c) => c.domain === "waveformlabs.dev");
    expect(wave?.contact?.name).toBe("Alex Chen");
    expect(wave?.channel).toBe("linkedin");
  });
});
