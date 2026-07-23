import { z } from "zod";

export interface DraftLlmClient {
  kind: "deepseek" | "ollama" | "fixture";
  complete(prompt: string): Promise<unknown>;
}

export interface CreateDraftLlmOptions {
  /** Explicit fixture JSON / object — tests & offline. */
  fixture?: unknown;
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  ollamaUrl?: string;
}

function parseJsonContent(content: string): unknown {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("LLM returned non-JSON content");
  }
}

function fixtureClient(value: unknown): DraftLlmClient {
  return {
    kind: "fixture",
    complete: async () => value,
  };
}

function deepSeekClient(apiKey: string, fetchImpl: typeof fetch): DraftLlmClient {
  return {
    kind: "deepseek",
    complete: async (prompt: string) => {
      const response = await fetchImpl(
        "https://api.deepseek.com/chat/completions",
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "deepseek-chat",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
            temperature: 0.4,
          }),
        },
      );
      if (!response.ok) {
        throw new Error(`DeepSeek request failed (${response.status})`);
      }
      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = body.choices?.[0]?.message?.content;
      if (!content) throw new Error("DeepSeek returned no content");
      return parseJsonContent(content);
    },
  };
}

function ollamaClient(
  baseUrl: string,
  fetchImpl: typeof fetch,
  model: string,
): DraftLlmClient {
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
          options: { temperature: 0.4 },
        }),
      });
      if (!response.ok) {
        throw new Error(`Ollama request failed (${response.status})`);
      }
      const body = (await response.json()) as {
        message?: { content?: string };
      };
      if (!body.message?.content) throw new Error("Ollama returned no content");
      return parseJsonContent(body.message.content);
    },
  };
}

/** DeepSeek → Ollama → explicit fixture. */
export async function createDraftLlmClient(
  options: CreateDraftLlmOptions = {},
): Promise<DraftLlmClient> {
  if (options.fixture !== undefined) return fixtureClient(options.fixture);
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiKey = env["DEEPSEEK_API_KEY"]?.trim();
  if (apiKey) return deepSeekClient(apiKey, fetchImpl);
  const baseUrl = (
    options.ollamaUrl ?? env["OLLAMA_URL"] ?? env["OLLAMA_HOST"] ?? "http://127.0.0.1:11434"
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
    // fall through
  }
  throw new Error(
    "No draft LLM: set DEEPSEEK_API_KEY, start Ollama, or pass fixture/--fixtures",
  );
}

export const RetryHintSchema = z.object({
  previous_error: z.string(),
});
