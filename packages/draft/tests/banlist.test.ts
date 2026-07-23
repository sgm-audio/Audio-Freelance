import { describe, expect, it } from "vitest";
import { lintBanList } from "../src/banlist.js";

describe("ban-list lint", () => {
  it("flags banned phrases", () => {
    expect(lintBanList("Hello — I hope this finds you well.")).toContain(
      "ban:i hope this finds you well",
    );
    expect(lintBanList("I came across your product")).toContain(
      "ban:i came across",
    );
    expect(lintBanList("Looking for synergy")).toContain("ban:synergy");
  });

  it("flags em-dash chains", () => {
    expect(lintBanList("A — B — C")).toContain("ban:em-dash-chain");
  });

  it("allows clean copy", () => {
    expect(lintBanList("Saw your AUv3 update. Open to a short call?")).toEqual(
      [],
    );
  });
});
