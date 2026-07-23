import {
  loadSendConfig,
  sendApprovedEmails,
  startUnsubscribeServer,
} from "@sgm-outreach/send";
import { openAndMigrate } from "@sgm-outreach/core";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { defaultDbPath } from "./status.js";

function parseFlag(argv: string[], name: string): string | undefined {
  const idx = argv.indexOf(name);
  if (idx < 0) return undefined;
  return argv[idx + 1];
}

function parseLimit(argv: string[]): number | undefined {
  const raw = parseFlag(argv, "--limit");
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`Invalid --limit: ${raw}`);
  }
  return n;
}

function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(name);
}

/** Email-only send for APPROVED leads (Resend + CASL + suppressions). */
export async function runSendCommand(argv: string[]): Promise<void> {
  const dbPath = parseFlag(argv, "--db") ?? defaultDbPath();
  const limit = parseLimit(argv);
  const listenUnsub = hasFlag(argv, "--listen-unsub");
  const portRaw = parseFlag(argv, "--port");
  const port = portRaw ? Number(portRaw) : 8791;
  if (listenUnsub && (!Number.isInteger(port) || port < 1)) {
    throw new Error(`Invalid --port: ${portRaw}`);
  }

  mkdirSync(dirname(dbPath), { recursive: true });
  const db = openAndMigrate(dbPath);
  try {
    const config = loadSendConfig();
    if (listenUnsub) {
      startUnsubscribeServer({
        db,
        unsubSecret: config.unsubSecret,
        port,
      });
      console.log(
        `unsubscribe server listening on http://127.0.0.1:${port}/unsubscribe`,
      );
      console.log("(Ctrl+C to stop — send batch still runs below)");
    }

    if (!config.resendApiKey) {
      console.error(
        "BLOCKER: RESEND_API_KEY is not set. Code + mocked tests are complete; live send is blocked until the key (and verified domain sgmstudios.ca) are provided.",
      );
      process.exitCode = 1;
      return;
    }

    const result = await sendApprovedEmails({
      db,
      config,
      ...(limit !== undefined ? { limit } : {}),
    });

    if (result.paused) {
      console.log("send: SKIPPED — pipeline is paused (sgm-outreach resume)");
      return;
    }

    console.log(
      `send: ${result.sent.length} sent, ${result.skipped.length} skipped`,
    );
    for (const s of result.sent) {
      if (s.ok) {
        console.log(
          `  SENT ${s.lead_id} → ${s.to}` +
            (s.staging ? ` (staging; intended ${s.intended_to})` : "") +
            ` resend=${s.resend_id}`,
        );
      }
    }
    for (const s of result.skipped) {
      if (!s.ok) {
        console.log(`  SKIP ${s.lead_id} reason=${s.reason}`);
      }
    }

    if (listenUnsub) {
      await new Promise<void>(() => {
        /* keep process alive for unsubscribe HTTP */
      });
    }
  } finally {
    if (!listenUnsub) db.close();
  }
}
