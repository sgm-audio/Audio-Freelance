import { z } from "zod";

export const ExtractedFactsSchema = z.object({
  facts: z
    .array(
      z.object({
        fact: z.string().min(1),
        evidence_url: z.string().url(),
      }),
    )
    .min(1),
  signals: z.object({
    team_size: z.number().int().nonnegative().nullable().optional(),
    shipping_evidence: z.boolean().optional(),
    hiring_signal: z.boolean().optional(),
    segment_hints: z.array(z.string().min(1)).optional(),
  }),
  needs_manual: z.boolean().optional(),
});

export type ExtractedFacts = z.infer<typeof ExtractedFactsSchema>;
