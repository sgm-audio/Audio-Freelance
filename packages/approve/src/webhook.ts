import { createHmac, timingSafeEqual } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { OutreachDb } from "@sgm-outreach/core";
import { applyApprovalAction } from "./actions.js";

const DEFAULT_MAX_BODY_BYTES = 64 * 1024;
const DEFAULT_MAX_AGE_SECONDS = 300;

class BodyTooLargeError extends Error {}

function readBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    req.on("data", (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > maxBytes) {
        req.removeAllListeners("data");
        req.resume();
        reject(new BodyTooLargeError("request body too large"));
        return;
      }
      chunks.push(buffer);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

export function signApprovalPayload(secret: string, timestamp: string, rawBody: string): string {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`;
}

function signaturesMatch(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export interface ApprovalWebhookOptions {
  secret: string;
  maxAgeSeconds?: number;
  maxBodyBytes?: number;
  now?: () => number;
}

/**
 * n8n approval receiver: POST JSON { action, draft_id, ... }.
 *
 * Requests must include `X-SGM-Timestamp` (Unix seconds) and
 * `X-SGM-Signature` (`sha256=<HMAC(timestamp + "." + rawBody)>`).
 */
export function createApprovalWebhookListener(
  db: OutreachDb,
  options: ApprovalWebhookOptions,
): (req: IncomingMessage, res: ServerResponse) => void {
  if (options.secret.length < 32) {
    throw new Error("approval webhook secret must be at least 32 characters");
  }
  const maxAgeSeconds = options.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS;
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const now = options.now ?? (() => Date.now());
  const usedSignatures = new Map<string, number>();

  return (req, res) => {
    void (async () => {
      try {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        if (req.method === "GET" && url.pathname === "/health") {
          sendJson(res, 200, { ok: true });
          return;
        }
        if (req.method !== "POST") {
          sendJson(res, 405, { ok: false, error: "method_not_allowed" });
          return;
        }
        if (
          !url.pathname.endsWith("/approve") &&
          url.pathname !== "/" &&
          !url.pathname.endsWith("/webhook")
        ) {
          sendJson(res, 404, { ok: false, error: "not_found" });
          return;
        }

        const timestamp = String(req.headers["x-sgm-timestamp"] ?? "");
        const signature = String(req.headers["x-sgm-signature"] ?? "");
        const timestampSeconds = Number(timestamp);
        const nowSeconds = Math.floor(now() / 1000);
        if (
          !timestamp ||
          !signature ||
          !Number.isSafeInteger(timestampSeconds) ||
          Math.abs(nowSeconds - timestampSeconds) > maxAgeSeconds
        ) {
          sendJson(res, 401, { ok: false, error: "invalid_signature" });
          return;
        }

        const rawText = await readBody(req, maxBodyBytes);
        const expected = signApprovalPayload(options.secret, timestamp, rawText);
        if (!signaturesMatch(signature, expected)) {
          sendJson(res, 401, { ok: false, error: "invalid_signature" });
          return;
        }

        // Bound replay state by dropping entries after the same window used for timestamps.
        for (const [seen, seenAt] of usedSignatures) {
          if (nowSeconds - seenAt > maxAgeSeconds) usedSignatures.delete(seen);
        }
        if (usedSignatures.has(signature)) {
          sendJson(res, 409, { ok: false, error: "replayed_request" });
          return;
        }
        if (usedSignatures.size >= 10_000) {
          const oldest = usedSignatures.keys().next().value as string | undefined;
          if (oldest) usedSignatures.delete(oldest);
        }
        usedSignatures.set(signature, nowSeconds);

        let raw: unknown;
        try {
          raw = JSON.parse(rawText || "{}");
        } catch {
          sendJson(res, 400, { ok: false, error: "invalid_json" });
          return;
        }
        const result = applyApprovalAction(db, raw);
        sendJson(res, result.ok ? 200 : 400, result);
      } catch (err) {
        if (err instanceof BodyTooLargeError) {
          sendJson(res, 413, { ok: false, error: "body_too_large" });
          return;
        }
        sendJson(res, 500, { ok: false, error: "internal_error" });
      }
    })();
  };
}

export function startApprovalWebhookServer(options: {
  db: OutreachDb;
  secret: string;
  host?: string;
  port?: number;
}): Server {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 8788;
  const server = createServer(
    createApprovalWebhookListener(options.db, { secret: options.secret }),
  );
  server.listen(port, host);
  return server;
}
