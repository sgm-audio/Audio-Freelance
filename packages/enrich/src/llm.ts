import { z } from "zod";
import { ExtractedFactsSchema, type ExtractedFacts } from "./facts.js";
import type { ScrapedPage } from "./scraper.js";

export interface LlmClient {
  kind: "deepseek" | "ollama" | "fixture";
  complete(prompt: string): Promise<unknown>;
}

export interface CreateLlmClientOptions {
  fixture?: unknown;
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  ollamaUrl?: string;
}

export class LlmValidationError extends Error {
  readonly issues: string[];
  readonly needsManual = true;

  constructor(issues: string[]) {
    super(`LLM fact extraction failed validation: ${issues.join("; ")}`);
    this.issues = issues;
    this.name = "LlmValidationError";
  }
}

function fixtureClient(value: unknown): LlmClient {
  return {
    kind: "fixture",
    complete: async () => value,
  };
}

function deepSeekClient(apiKey: string, fetchImpl: typeof fetch): LlmClient {
  return {
    kind: "deepseek",
    complete: async (prompt: string) => {
      const response = await fetchImpl("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
          temperature: 0,
        }),
      });
      if (!response.ok) {
        throw new Error(`DeepSeek request failed (${response.status})`);
      }
      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = body.choices?.[0]?.message?.content;
      if (!content) throw new Error("DeepSeek returned no content");
      return content;
    },
  };
}

function ollamaClient(
  baseUrl: string,
  fetchImpl: typeof fetch,
  model: string,
): LlmClient {
  return {
    kind: "ollama",
    complete: async (prompt: string) => {
      const response = await fetchImpl(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          stream: false,
          format: "json",
          messages: [{ role: "user", content: prompt }],
          options: { temperature: 0 },
        }),
      });
      if (!response.ok)
        throw new Error(`Ollama request failed (${response.status})`);
      const body = (await response.json()) as {
        message?: { content?: string };
      };
      if (!body.message?.content) throw new Error("Ollama returned no content");
      return body.message.content;
    },
  };
}

/** Select DeepSeek, then a reachable Ollama server, then an explicit fixture. */
export async function createLlmClient(
  options: CreateLlmClientOptions = {},
): Promise<LlmClient> {
  if (options.fixture !== undefined) return fixtureClient(options.fixture);
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiKey = env["DEEPSEEK_API_KEY"]?.trim();
  if (apiKey) return deepSeekClient(apiKey, fetchImpl);
  const baseUrl = (
    options.ollamaUrl ?? env["OLLAMA_URL"] ?? "http://127.0.0.1:11434"
  ).replace(/\/$/, "");
  try {
    const response = await fetchImpl(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(1500),
    });
    if (response.ok) {
      return ollamaClient(
        baseUrl,
        fetchImpl,
        env["OLLAMA_MODEL"] ?? "qwen2.5:7b",
      );
    }
  } catch {
    // Fall through to an actionable live-mode error.
  }
  throw new Error(
    "Live enrichment requires DEEPSEEK_API_KEY or a running Ollama server; use fixtures for offline mode.",
  );
}

export interface ExtractFactsOptions {
  client: LlmClient;
  maxRetries?: number;
}

function pageText(page: ScrapedPage): string {
  const text = page.html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `URL: ${page.url}\nCONTENT: ${text.slice(0, 12_000)}`;
}

function parseCompletion(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const cleaned = value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(cleaned) as unknown;
}

function compactIssues(error: z.ZodError): string[] {
  return error.issues.slice(0, 8).map((issue) => {
    const path = issue.path.length ? issue.path.join(".") : "root";
    return `${path}: ${issue.message}`;
  });
}

export async function extractFactsWithRetry(
  pages: readonly ScrapedPage[],
  options: ExtractFactsOptions,
): Promise<ExtractedFacts> {
  if (pages.length === 0)
    throw new Error("Cannot extract facts without scraped pages");
  const maxRetries = options.maxRetries ?? 2;
  const evidenceUrls = new Set(pages.map((page) => page.url));
  let validationContext = "";
  let lastIssues: string[] = [];
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const prompt = [
      "Extract only verifiable company facts from these public pages.",
      'Return JSON: {"facts":[{"fact":"...","evidence_url":"https://..."}],"signals":{"team_size":null,"shipping_evidence":false,"hiring_signal":false,"segment_hints":[]},"needs_manual":false}.',
      "Every evidence_url must be one of the supplied page URLs. Do not infer unsupported claims.",
      validationContext,
      ...pages.map(pageText),
    ]
      .filter(Boolean)
      .join("\n\n");
    try {
      const parsedJson = parseCompletion(await options.client.complete(prompt));
      const parsed = ExtractedFactsSchema.safeParse(parsedJson);
      if (parsed.success) {
        const unsupported = parsed.data.facts
          .map((fact) => fact.evidence_url)
          .filter((url) => !evidenceUrls.has(url));
        if (unsupported.length === 0) return parsed.data;
        lastIssues = unsupported
          .slice(0, 8)
          .map((url) => `facts.evidence_url: URL was not supplied (${url})`);
      } else {
        lastIssues = compactIssues(parsed.error);
      }
    } catch (error) {
      lastIssues = [
        error instanceof Error
          ? error.message.slice(0, 240)
          : "Unknown JSON parse error",
      ];
    }
    validationContext = `Previous response was invalid. Fix these errors: ${lastIssues.join(" | ")}`;
  }
  throw new LlmValidationError(lastIssues);
}
