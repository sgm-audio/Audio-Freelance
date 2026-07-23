import { z } from "zod";

/** Runtime send configuration — OUTREACH_BUILD_SPEC §1 / §7 M4 / §10. */
export const SendConfigSchema = z
  .object({
    resendApiKey: z.string().min(1).optional(),
    fromEmail: z.string().email(),
    fromName: z.string().min(1),
    /** CASL identity — real person name (not a brand-only From). */
    senderRealName: z.string().min(1),
    businessName: z.string().min(1),
    /** Business contact (email and/or phone) shown in CASL footer. */
    businessContact: z.string().min(1),
    /** Base URL for unsubscribe links, e.g. http://127.0.0.1:8791/unsubscribe */
    unsubscribeBaseUrl: z.string().url(),
    /** HMAC secret for unsubscribe tokens. */
    unsubSecret: z.string().min(8),
    /** When true, all deliveries go to sinkEmail only. */
    staging: z.boolean(),
    sinkEmail: z.string().email().optional(),
  })
  .superRefine((cfg, ctx) => {
    if (cfg.staging && !cfg.sinkEmail) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "staging mode requires sinkEmail (SGM_OUTREACH_SINK_EMAIL)",
        path: ["sinkEmail"],
      });
    }
  });

export type SendConfig = z.infer<typeof SendConfigSchema>;

function envFlag(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function envString(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v ? v : undefined;
}

/**
 * Load send config from env (and optional overrides).
 * Staging: SGM_OUTREACH_STAGING=1 redirects to SGM_OUTREACH_SINK_EMAIL.
 */
export function loadSendConfig(
  overrides: Partial<SendConfig> = {},
): SendConfig {
  const staging = overrides.staging ?? envFlag("SGM_OUTREACH_STAGING");
  const raw = {
    resendApiKey: overrides.resendApiKey ?? envString("RESEND_API_KEY"),
    fromEmail:
      overrides.fromEmail ??
      envString("SGM_OUTREACH_FROM_EMAIL") ??
      "scott@sgmstudios.ca",
    fromName:
      overrides.fromName ?? envString("SGM_OUTREACH_FROM_NAME") ?? "Scott",
    senderRealName:
      overrides.senderRealName ??
      envString("SGM_OUTREACH_SENDER_NAME") ??
      "Scott",
    businessName:
      overrides.businessName ??
      envString("SGM_OUTREACH_BUSINESS_NAME") ??
      "SGM Studios",
    businessContact:
      overrides.businessContact ??
      envString("SGM_OUTREACH_BUSINESS_CONTACT") ??
      "scott@sgmstudios.ca",
    unsubscribeBaseUrl:
      overrides.unsubscribeBaseUrl ??
      envString("SGM_OUTREACH_UNSUBSCRIBE_BASE_URL") ??
      "http://127.0.0.1:8791/unsubscribe",
    unsubSecret:
      overrides.unsubSecret ??
      envString("SGM_OUTREACH_UNSUB_SECRET") ??
      envString("RESEND_API_KEY"),
    staging,
    sinkEmail: overrides.sinkEmail ?? envString("SGM_OUTREACH_SINK_EMAIL"),
  };

  return SendConfigSchema.parse(raw);
}
