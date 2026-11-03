import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ClaimsFileSchema,
  claimAllowlistPhrases,
  loadClaimsFile,
} from "../src/index.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const claimsPath = resolve(repoRoot, "config", "claims.json");

describe("config/claims.json", () => {
  it("loads and validates against ClaimsFileSchema", () => {
    const file = loadClaimsFile(claimsPath);
    const ids = file.claims.map((claim) => claim.id);
    expect(ids).toEqual(expect.arrayContaining([
      "trackclear_reapack",
      "portamento_engine_contract",
      "makingmadi_operating",
      "years_audio_17",
    ]));
    expect(new Set(ids).size).toBe(ids.length);
    expect(claimAllowlistPhrases(file).length).toBeGreaterThanOrEqual(ids.length);
  });

  it("rejects unknown claim shapes", () => {
    const raw = JSON.parse(readFileSync(claimsPath, "utf8")) as {
      claims: Array<Record<string, unknown>>;
    };
    raw.claims.push({ id: "BadId", text: "x", match: ["x"], evidence: "e" });
    expect(() => ClaimsFileSchema.parse(raw)).toThrow();
  });
});
