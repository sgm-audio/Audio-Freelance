import { describe, expect, it } from "vitest";
import { extractFactsWithRetry, type LlmClient } from "../src/llm.js";

describe("LLM fact extraction", () => {
  it("feeds compact Zod failures into a retry", async () => {
    const prompts: string[] = [];
    const responses: unknown[] = [
      { facts: [{ fact: "", evidence_url: "not-a-url" }], signals: {} },
      {
        facts: [
          {
            fact: "Acme ships a real-time audio plugin.",
            evidence_url: "https://acme.example/",
          },
        ],
        signals: { shipping_evidence: true, segment_hints: ["plugins"] },
      },
    ];
    const client: LlmClient = {
      kind: "fixture",
      complete: async (prompt) => {
        prompts.push(prompt);
        return responses.shift();
      },
    };

    const extracted = await extractFactsWithRetry(
      [
        {
          url: "https://acme.example/",
          path: "/",
          html: "<p>Acme ships a real-time audio plugin.</p>",
        },
      ],
      { client },
    );

    expect(extracted.facts).toHaveLength(1);
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("Previous response was invalid");
    expect(prompts[1]).toContain("facts.0");
  });
});
