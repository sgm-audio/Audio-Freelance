import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createInterface } from "node:readline";
import { openAndMigrate } from "@sgm-outreach/core";
import { handleWebhookPayload, serveWebhooks } from "@sgm-outreach/ops";
import { defaultDbPath } from "./status.js";

function flagValue(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i === -1) return undefined;
  return argv[i + 1];
}

async function readStdinJson(): Promise<unknown> {
  const chunks: string[] = [];
  const rl = createInterface({ input: process.stdin });
  for await (const line of rl) chunks.push(line);
  const text = chunks.join("\n").trim();
  if (!text) throw new Error("webhook handle expects JSON on stdin");
  return JSON.parse(text) as unknown;
}

/**
 * sgm-outreach webhook serve|handle
 *
 * Staging dry-run flag: SGM_OUTREACH_STAGING=1 affects send path only;
 * webhooks still update lead state in SGM_OUTREACH_DB.
 */
export async function runWebhookCommand(argv: string[]): Promise<void> {
  const sub = argv[3];
  const dbPath = flagValue(argv, "--db") ?? defaultDbPath();
  mkdirSync(dirname(dbPath), { recursive: true });

  if (sub === "handle") {
    const body = await readStdinJson();
    const db = openAndMigrate(dbPath);
    try {
      const result = handleWebhookPayload(db, body);
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exitCode = 1;
    } finally {
      db.close();
    }
    return;
  }

  if (sub === "serve") {
    const port = Number(
      flagValue(argv, "--port") ??
        process.env["SGM_OUTREACH_WEBHOOK_PORT"] ??
        "8787",
    );
    const host =
      flagValue(argv, "--host") ??
      process.env["SGM_OUTREACH_WEBHOOK_HOST"] ??
      "127.0.0.1";
    const db = openAndMigrate(dbPath);
    const server = await serveWebhooks({ db, port, host });
    console.log(
      `webhook listening http://${host}:${port}/webhooks/resend (health: /health)`,
    );
    console.log("POST simple JSON: {\"kind\":\"reply\",\"email\":\"…\"} or Resend envelope");
    const shutdown = async () => {
      await server.close();
      db.close();
      process.exit(0);
    };
    process.on("SIGINT", () => void shutdown());
    process.on("SIGTERM", () => void shutdown());
    await new Promise(() => {
      /* keep alive until signal */
    });
    return;
  }

  console.error(`Usage: sgm-outreach webhook <serve|handle> [--port 8787] [--db path]`);
  process.exit(1);
}
