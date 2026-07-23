import {
  applyApprovalAction,
  buildDigest,
  formatDigestText,
  pushDigestWebhook,
  startApprovalWebhookServer,
} from "@sgm-outreach/approve";
import { openAndMigrate } from "@sgm-outreach/core";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { defaultDbPath } from "./status.js";

function parseFlag(argv: string[], name: string): string | undefined {
  const idx = argv.indexOf(name);
  if (idx < 0) return undefined;
  return argv[idx + 1];
}

function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(name);
}

/**
 * approve [draftId] | reject <draftId> | edit <draftId> --body ... | digest | serve
 */
export async function runApproveCommand(argv: string[]): Promise<void> {
  const dbPath = parseFlag(argv, "--db") ?? defaultDbPath();
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = openAndMigrate(dbPath);

  try {
    const sub = argv[3];

    if (!sub || sub === "digest") {
      const digest = buildDigest(db);
      console.log(formatDigestText(digest));
      if (hasFlag(argv, "--push")) {
        const pushed = await pushDigestWebhook(digest);
        console.log(
          pushed.pushed
            ? `webhook pushed status=${pushed.status}`
            : "webhook skipped (N8N_APPROVAL_WEBHOOK_URL unset)",
        );
      }
      return;
    }

    if (sub === "serve") {
      const port = Number(parseFlag(argv, "--port") ?? "8788");
      startApprovalWebhookServer({ db, port });
      console.log(
        `approval webhook listening on http://127.0.0.1:${port}/webhook`,
      );
      await new Promise<void>(() => {
        /* keep alive */
      });
      return;
    }

    if (sub === "reject") {
      const draftId = argv[4];
      if (!draftId) throw new Error("Usage: sgm-outreach approve reject <draftId>");
      const reason = parseFlag(argv, "--reason") ?? "rejected";
      const result = applyApprovalAction(db, {
        action: "reject",
        draft_id: draftId,
        reason,
      });
      console.log(JSON.stringify(result));
      if (!result.ok) process.exitCode = 1;
      return;
    }

    if (sub === "edit") {
      const draftId = argv[4];
      const body = parseFlag(argv, "--body");
      if (!draftId || !body) {
        throw new Error(
          "Usage: sgm-outreach approve edit <draftId> --body <text>",
        );
      }
      const subject = parseFlag(argv, "--subject");
      const result = applyApprovalAction(db, {
        action: "edit",
        draft_id: draftId,
        body,
        ...(subject !== undefined ? { subject } : {}),
      });
      console.log(JSON.stringify(result));
      if (!result.ok) process.exitCode = 1;
      return;
    }

    // `sgm-outreach approve <draftId>` or `approve approve <draftId>`
    const draftId = sub === "approve" ? argv[4] : sub;
    if (!draftId) {
      throw new Error("Usage: sgm-outreach approve <draftId>");
    }
    const result = applyApprovalAction(db, {
      action: "approve",
      draft_id: draftId,
    });
    console.log(JSON.stringify(result));
    if (!result.ok) process.exitCode = 1;
  } finally {
    if (argv[3] !== "serve") db.close();
  }
}
