import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { unsubscribeEmail, type OutreachDb } from "@sgm-outreach/core";
import { verifyUnsubToken } from "./casl.js";

export interface UnsubscribeServerOptions {
  db: OutreachDb;
  unsubSecret: string;
  host?: string;
  port?: number;
}

function readUrl(req: IncomingMessage): URL {
  const host = req.headers.host ?? "127.0.0.1";
  return new URL(req.url ?? "/", `http://${host}`);
}

function sendHtml(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(body);
}

/**
 * HTTP unsubscribe endpoint.
 * GET /unsubscribe?token=... → writes suppressions + UNSUBSCRIBED transition.
 */
export function createUnsubscribeRequestListener(
  db: OutreachDb,
  unsubSecret: string,
): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    try {
      const url = readUrl(req);
      if (req.method !== "GET" && req.method !== "HEAD") {
        sendHtml(res, 405, "<p>Method not allowed</p>");
        return;
      }
      if (!url.pathname.endsWith("/unsubscribe") && url.pathname !== "/") {
        sendHtml(res, 404, "<p>Not found</p>");
        return;
      }
      const token = url.searchParams.get("token");
      if (!token) {
        sendHtml(res, 400, "<p>Missing unsubscribe token.</p>");
        return;
      }
      const payload = verifyUnsubToken(token, unsubSecret);
      if (!payload) {
        sendHtml(res, 400, "<p>Invalid or expired unsubscribe token.</p>");
        return;
      }
      unsubscribeEmail(db, payload.email);
      sendHtml(
        res,
        200,
        `<!doctype html><html><body><p>You have been unsubscribed (${payload.email}). You will not receive further outreach from SGM Studios.</p></body></html>`,
      );
    } catch (err) {
      sendHtml(
        res,
        500,
        `<p>Unsubscribe failed: ${err instanceof Error ? err.message : String(err)}</p>`,
      );
    }
  };
}

export function startUnsubscribeServer(
  options: UnsubscribeServerOptions,
): Server {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 8791;
  const listener = createUnsubscribeRequestListener(
    options.db,
    options.unsubSecret,
  );
  const server = createServer(listener);
  server.listen(port, host);
  return server;
}
