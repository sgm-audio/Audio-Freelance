import { normalizeDomain } from "@sgm-outreach/core";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { IngestCandidate } from "../types.js";

/** Map common Sales Navigator / LinkedIn export headers → fields. */
const HEADER_ALIASES: Record<string, string> = {
    "first name": "first_name",
    "last name": "last_name",
    "full name": "full_name",
    name: "full_name",
    title: "role",
    "job title": "role",
    company: "company",
    "company name": "company",
    "company domain": "domain",
    domain: "domain",
    website: "domain",
    "company website": "domain",
    email: "email",
    "email address": "email",
    "linkedin url": "linkedin_url",
    "profile url": "linkedin_url",
    "linkedin profile url": "linkedin_url",
};
function parseCsvLine(line: string): string[] {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"') {
                if (line[i + 1] === '"') {
                    cur += '"';
                    i += 1;
                }
                else {
                    inQuotes = false;
                }
            }
            else {
                cur += ch;
            }
        }
        else if (ch === '"') {
            inQuotes = true;
        }
        else if (ch === ",") {
            out.push(cur);
            cur = "";
        }
        else {
            cur += ch;
        }
    }
    out.push(cur);
    return out;
}
function mapHeaders(rawHeaders: string[]): string[] {
    return rawHeaders.map((h) => {
        const key = h.trim().toLowerCase();
        return HEADER_ALIASES[key] ?? key.replace(/\s+/g, "_");
    });
}
/**
 * Parse a Sales Navigator (or compatible) lead CSV into ingest candidates.
 * Dedupes by domain within the file.
 */
export function parseSalesNavCsv(csvText: string): IngestCandidate[] {
    const lines = csvText
        .replace(/^\uFEFF/, "")
        .split(/\r?\n/)
        .filter((l) => l.trim().length > 0);
    if (lines.length < 2)
        return [];
    const headers = mapHeaders(parseCsvLine(lines[0] ?? ""));
    const seen = new Set<string>();
    const out: IngestCandidate[] = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i] ?? "");
        const row: Record<string, string> = {};
        for (let j = 0; j < headers.length; j++) {
            const header = headers[j];
            if (header) row[header] = (cols[j] ?? "").trim();
        }
        const company = row["company"] ?? "";
        let domain = row["domain"] ?? "";
        if (!domain && row["email"]) {
            const at = row["email"].indexOf("@");
            if (at > 0)
                domain = row["email"].slice(at + 1);
        }
        const normalized = normalizeDomain(domain);
        if (!company || !normalized || seen.has(normalized))
            continue;
        seen.add(normalized);
        const fullName = row["full_name"] ||
            [row["first_name"], row["last_name"]].filter(Boolean).join(" ").trim();
        const email = row["email"] && row["email"].includes("@") ? row["email"] : null;
        const linkedin = row["linkedin_url"] && row["linkedin_url"].startsWith("http")
            ? row["linkedin_url"]
            : null;
        const candidate: IngestCandidate = {
            name: company,
            domain: normalized,
            segment: "music-tech",
            source: "salesnav-csv",
            channel: "linkedin",
            tier: 1,
            ...(fullName
                ? {
                      contact: {
                          name: fullName,
                          role: row["role"] || null,
                          email,
                          linkedin_url: linkedin,
                      },
                  }
                : {}),
        };
        out.push(candidate);
    }
    return out;
}
export function ingestSalesNavInbox(inboxDir: string): IngestCandidate[] {
    let files;
    try {
        files = readdirSync(inboxDir)
            .filter((f) => f.toLowerCase().endsWith(".csv"))
            .sort();
    }
    catch {
        return [];
    }
    const seen = new Set();
    const out = [];
    for (const file of files) {
        const text = readFileSync(join(inboxDir, file), "utf8");
        for (const c of parseSalesNavCsv(text)) {
            if (seen.has(c.domain))
                continue;
            seen.add(c.domain);
            out.push(c);
        }
    }
    return out;
}
//# sourceMappingURL=salesnav-csv.js.map