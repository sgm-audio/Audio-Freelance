import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { SendConfig } from "./config.js";

const UnsubTokenPayloadSchema = z.object({
  email: z.string().email(),
  lead_id: z.string().uuid().optional(),
});

export type UnsubTokenPayload = z.infer<typeof UnsubTokenPayloadSchema>;

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}

/** Sign unsubscribe token (HMAC-SHA256). */
export function signUnsubToken(
  payload: UnsubTokenPayload,
  secret: string,
): string {
  const parsed = UnsubTokenPayloadSchema.parse(payload);
  const body = b64url(Buffer.from(JSON.stringify(parsed), "utf8"));
  const sig = b64url(
    createHmac("sha256", secret).update(body).digest(),
  );
  return `${body}.${sig}`;
}

/** Verify token; returns null on any failure (fail closed). */
export function verifyUnsubToken(
  token: string,
  secret: string,
): UnsubTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;
  const expected = b64url(
    createHmac("sha256", secret).update(body).digest(),
  );
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const json = JSON.parse(fromB64url(body).toString("utf8"));
    return UnsubTokenPayloadSchema.parse(json);
  } catch {
    return null;
  }
}

export function buildUnsubscribeUrl(
  config: SendConfig,
  payload: UnsubTokenPayload,
): string {
  const token = signUnsubToken(payload, config.unsubSecret);
  const base = config.unsubscribeBaseUrl.replace(/\/$/, "");
  const url = new URL(base.includes("://") ? base : `https://${base}`);
  // If base already ends with /unsubscribe path, append token as query.
  if (!url.pathname || url.pathname === "/") {
    url.pathname = "/unsubscribe";
  }
  url.searchParams.set("token", token);
  return url.toString();
}

/**
 * CASL footer appended by send/ (never by the LLM).
 * Spec §1: real name, SGM Studios, business contact, working unsubscribe link.
 */
export function appendCaslFooter(
  body: string,
  config: SendConfig,
  unsubUrl: string,
): string {
  const trimmed = body.replace(/\s+$/, "");
  const footer = [
    "",
    "--",
    config.senderRealName,
    config.businessName,
    config.businessContact,
    `Unsubscribe: ${unsubUrl}`,
  ].join("\n");
  return `${trimmed}\n${footer}\n`;
}
