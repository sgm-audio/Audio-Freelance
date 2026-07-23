import { z } from "zod";

export const ResendSendPayloadSchema = z.object({
  from: z.string().min(1),
  to: z.array(z.string().email()).min(1),
  subject: z.string().min(1),
  text: z.string().min(1),
});

export type ResendSendPayload = z.infer<typeof ResendSendPayloadSchema>;

export const ResendSendResultSchema = z.object({
  id: z.string().min(1),
});

export type ResendSendResult = z.infer<typeof ResendSendResultSchema>;

/** Injectable transport — production uses Resend HTTP API; tests mock this. */
export interface ResendTransport {
  send(payload: ResendSendPayload): Promise<ResendSendResult>;
}

const ResendApiResponseSchema = z.object({
  id: z.string().min(1),
});

/**
 * Real Resend API client via fetch (no SDK dependency).
 * https://api.resend.com/emails
 */
export function createResendTransport(apiKey: string): ResendTransport {
  if (!apiKey.trim()) {
    throw new Error("RESEND_API_KEY is required to create Resend transport");
  }
  return {
    async send(payload: ResendSendPayload): Promise<ResendSendResult> {
      const body = ResendSendPayloadSchema.parse(payload);
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let json: unknown;
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(
          `Resend API returned non-JSON (${res.status}): ${text.slice(0, 200)}`,
        );
      }
      if (!res.ok) {
        throw new Error(
          `Resend API error ${res.status}: ${text.slice(0, 400)}`,
        );
      }
      return ResendSendResultSchema.parse(ResendApiResponseSchema.parse(json));
    },
  };
}
