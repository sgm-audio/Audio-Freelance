import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadClaimsFile } from "@sgm-outreach/core";
import { describe, expect, it } from "vitest";
import { lintClaims } from "../src/claims-lint.js";
import { DraftValidationError, validateDraftOutput } from "../src/validate.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const claims = loadClaimsFile(resolve(repoRoot, "config", "claims.json"));

describe("claims allowlist", () => {
  it("rejects fabricated claim", () => {
    const flags = lintClaims(
      "I won a Grammy for my industry-leading plugin suite at SGM Studios.",
      claims,
    );
    expect(flags.some((f) => f.startsWith("fabricated_claim:"))).toBe(true);
    expect(() =>
      validateDraftOutput(
        {
          body: "I won a Grammy for my industry-leading plugin suite.",
          fact_used: "Shipped AUv3 update",
          risk_flags: [],
        },
        "email",
        claims,
        "Shipped AUv3 update",
      ),
    ).toThrow(DraftValidationError);
  });

  it("accepts allowlisted credibility", () => {
    const body =
      "Noticed your AUv3 update. TrackClear is live on ReaPack. I build real-time DSP engines. Open to a 20-minute call?";
    expect(lintClaims(body, claims)).toEqual([]);
    const out = validateDraftOutput(
      {
        subject: "AUv3 + DSP",
        body,
        fact_used: "Shipped AUv3 update last month",
        risk_flags: [],
      },
      "email",
      claims,
      "Shipped AUv3 update last month",
    );
    expect(out.body).toContain("TrackClear");
  });
});
