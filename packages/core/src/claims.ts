import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ClaimsFileSchema, type ClaimsFile } from "./schemas.js";

/** Load and validate `config/claims.json` (repo-root relative by default). */
export function loadClaimsFile(path?: string): ClaimsFile {
  const file = resolve(path ?? resolve(process.cwd(), "config", "claims.json"));
  const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
  return ClaimsFileSchema.parse(raw);
}

/** Flattened match phrases for allowlist checks (includes canonical text). */
export function claimAllowlistPhrases(file: ClaimsFile): string[] {
  const out: string[] = [];
  for (const claim of file.claims) {
    out.push(claim.text, ...claim.match);
  }
  return out;
}
