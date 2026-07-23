import { ChannelSchema } from "@sgm-outreach/core";
import { z } from "zod";

/** Candidate emitted by a source parser before DB write. */
export const IngestCandidateSchema = z.object({
  name: z.string().min(1),
  domain: z.string().min(1),
  segment: z.string().min(1).default("unknown"),
  source: z.string().min(1),
  channel: ChannelSchema.default("email"),
  tier: z.number().int().nonnegative().default(0),
  contact: z
    .object({
      name: z.string().min(1),
      role: z.string().nullable().optional(),
      email: z.string().email().nullable().optional(),
      linkedin_url: z.string().url().nullable().optional(),
    })
    .optional(),
  meta: z.record(z.unknown()).optional(),
});

export const IngestSourceSchema = z.enum([
  "appstore-auv3",
  "salesnav-csv",
  "upwork-rss",
  "jobboards",
  "manual",
]);

export type IngestCandidate = z.infer<typeof IngestCandidateSchema>;
export type IngestSource = z.infer<typeof IngestSourceSchema>;

export interface IngestWriteResult {
  companies_created: number;
  companies_deduped: number;
  contacts_created: number;
  leads_created: number;
  skipped_invalid: number;
}
