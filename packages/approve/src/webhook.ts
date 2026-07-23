import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { OutreachDb } from "@sgm-outreach/core";
import { applyApprovalAction } from "./actions.js";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

/**
 * n8n webhook receiver: POST JSON { action, draft_id, ... }.
 */
export function createApprovalWebhookListener(
  db: OutreachDb,
): (req: IncomingMessage, res: ServerResponse) => void {
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
        const rawText = await readBody(req);
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
        sendJson(res, 500, {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();
  };
}

export function startApprovalWebhookServer(options: {
  db: OutreachDb;
  host?: string;
  port?: number;
}): Server {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 8788;
  const server = createServer(createApprovalWebhookListener(options.db));
  server.listen(port, host);
  return server;
}
