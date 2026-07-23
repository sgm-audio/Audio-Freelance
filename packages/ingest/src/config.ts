import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

export const IngestConfigSchema = z.object({
    upwork_rss_urls: z.array(z.string().url()).default([]),
    appstore_terms: z.array(z.string().min(1)).optional(),
    jobboards: z
        .object({
        soundlister_url: z.string().url().optional(),
        tap_url: z.string().url().optional(),
    })
        .default({}),
    inbox_dir: z.string().default("./inbox"),
});
export type IngestConfig = z.infer<typeof IngestConfigSchema>;

export function loadIngestConfig(path?: string): IngestConfig {
    const file = resolve(path ?? resolve(process.cwd(), "config", "ingest.json"));
    try {
        const raw = JSON.parse(readFileSync(file, "utf8"));
        return IngestConfigSchema.parse(raw);
    }
    catch (e: unknown) {
        if (
            e &&
            typeof e === "object" &&
            "code" in e &&
            (e as NodeJS.ErrnoException).code === "ENOENT"
        ) {
            return IngestConfigSchema.parse({});
        }
        throw e;
    }
}