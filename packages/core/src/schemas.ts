import { z } from "zod";

/** Lead lifecycle states — OUTREACH_BUILD_SPEC §2 */
export const LeadStateSchema = z.enum([
  "NEW",
  "ENRICHED",
  "SCORED",
  "DRAFTED",
  "PENDING_APPROVAL",
  "APPROVED",
  "SENT",
  "REPLIED",
  "NO_REPLY",
  "FOLLOWUP_1",
  "FOLLOWUP_2",
  "NURTURE",
  "HUMAN",
  "REJECTED",
  "BOUNCED",
  "UNSUBSCRIBED",
]);
export type LeadState = z.infer<typeof LeadStateSchema>;

export const ChannelSchema = z.enum(["email", "linkedin", "upwork"]);
export type Channel = z.infer<typeof ChannelSchema>;

export const CompanySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  domain: z.string().min(1),
  tier: z.number().int().nonnegative(),
  segment: z.string().min(1),
  source: z.string().min(1),
  created_at: z.string().datetime(),
});
export type Company = z.infer<typeof CompanySchema>;

export const ContactSchema = z.object({
  id: z.string().uuid(),
  company_id: z.string().uuid(),
  name: z.string().min(1),
  role: z.string().nullable(),
  email: z.string().email().nullable(),
  linkedin_url: z.string().url().nullable(),
  email_source: z.string().nullable(),
});
export type Contact = z.infer<typeof ContactSchema>;

export const FactSchema = z.object({
  id: z.string().uuid(),
  company_id: z.string().uuid(),
  fact: z.string().min(1),
  evidence_url: z.string().url(),
  extracted_at: z.string().datetime(),
});
export type Fact = z.infer<typeof FactSchema>;

export const LeadSchema = z.object({
  id: z.string().uuid(),
  company_id: z.string().uuid(),
  contact_id: z.string().uuid().nullable(),
  channel: ChannelSchema,
  state: LeadStateSchema,
  score: z.number().int(),
  updated_at: z.string().datetime(),
});
export type Lead = z.infer<typeof LeadSchema>;

export const DraftSchema = z.object({
  id: z.string().uuid(),
  lead_id: z.string().uuid(),
  subject: z.string().nullable(),
  body: z.string().min(1),
  personalization_fact_id: z.string().uuid().nullable(),
  model: z.string().min(1),
  created_at: z.string().datetime(),
});
export type Draft = z.infer<typeof DraftSchema>;

export const EventSchema = z.object({
  id: z.string().uuid(),
  lead_id: z.string().uuid(),
  from_state: LeadStateSchema.nullable(),
  to_state: LeadStateSchema,
  meta: z.record(z.unknown()),
  at: z.string().datetime(),
});
export type PipelineEvent = z.infer<typeof EventSchema>;

export const SuppressionSchema = z.object({
  email: z.string().email(),
  reason: z.string().min(1),
  at: z.string().datetime(),
});
export type Suppression = z.infer<typeof SuppressionSchema>;

export const SCORE_THRESHOLD = 60;

export const DraftOutputSchema = z.object({
  subject: z.string().optional(),
  body: z.string().min(1),
  fact_used: z.string().min(1),
  risk_flags: z.array(z.string()),
});
export type DraftOutput = z.infer<typeof DraftOutputSchema>;

/** Honest claim allowlist entry — OUTREACH_BUILD_SPEC §10 (anti-drift). */
export const ClaimSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z][a-z0-9_]*$/, "claim id must be snake_case"),
  text: z.string().min(1),
  /** Phrases used for draft allowlist matching (substring, case-insensitive). */
  match: z.array(z.string().min(1)).min(1),
  evidence: z.string().min(1),
});
export type Claim = z.infer<typeof ClaimSchema>;

export const ClaimsFileSchema = z
  .object({
    claims: z.array(ClaimSchema).min(1),
  })
  .superRefine((file, ctx) => {
    const ids = file.claims.map((c) => c.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "duplicate claim id",
        path: ["claims"],
      });
    }
  });
export type ClaimsFile = z.infer<typeof ClaimsFileSchema>;
