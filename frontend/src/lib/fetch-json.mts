export interface JsonClientOptions {
  baseUrl?: string;
  defaultTimeoutMs?: number;
  cacheTtlMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

type CacheEntry = { data: unknown; timestamp: number };

/** Small fetch client with bounded request time and successful-GET caching. */
export class JsonClient {
  readonly #baseUrl: string;
  readonly #defaultTimeoutMs: number;
  readonly #cacheTtlMs: number;
  readonly #fetch: typeof fetch;
  readonly #now: () => number;
  readonly #cache = new Map<string, CacheEntry>();
  readonly #inflight = new Map<string, Promise<unknown>>();

  constructor(options: JsonClientOptions = {}) {
    this.#baseUrl = options.baseUrl ?? "/api/v1";
    this.#defaultTimeoutMs = options.defaultTimeoutMs ?? 10_000;
    this.#cacheTtlMs = options.cacheTtlMs ?? 30_000;
    this.#fetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.#now = options.now ?? Date.now;
  }

  clear(): void {
    this.#cache.clear();
    this.#inflight.clear();
  }

  async get<T>(path: string, timeoutMs = this.#defaultTimeoutMs): Promise<T> {
    const cached = this.#cache.get(path);
    if (cached && this.#now() - cached.timestamp < this.#cacheTtlMs) {
      return cached.data as T;
    }
    const existing = this.#inflight.get(path);
    if (existing) return existing as Promise<T>;

    const request = this.#request<T>(path, { method: "GET" }, timeoutMs)
      .then((data) => {
        this.#cache.set(path, { data, timestamp: this.#now() });
        return data;
      })
      .finally(() => this.#inflight.delete(path));
    this.#inflight.set(path, request);
    return request;
  }

  post<T>(path: string, timeoutMs = 30_000): Promise<T> {
    return this.#request<T>(path, { method: "POST" }, timeoutMs);
  }

  async #request<T>(path: string, init: RequestInit, timeoutMs: number): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.#fetch(`${this.#baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`.trim());
      }
      return (await response.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }
}
