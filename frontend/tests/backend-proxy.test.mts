import assert from "node:assert/strict";
import test from "node:test";

import { proxyBackend } from "../src/lib/backend-proxy.ts";

const SETTINGS = ["API_KEY", "API_HOST", "API_PORT"] as const;

function withSettings(values: Record<string, string>, run: () => Promise<void>): Promise<void> {
  const originals = new Map(SETTINGS.map((name) => [name, process.env[name]]));
  for (const name of SETTINGS) {
    const value = values[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  const originalFetch = globalThis.fetch;
  return run().finally(() => {
    globalThis.fetch = originalFetch;
    for (const [name, value] of originals) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
}

test("injects the server-side API key and forwards the query string", async () => {
  await withSettings(
    { API_KEY: "test-secret", API_HOST: "backend.test", API_PORT: "9999" },
    async () => {
      let captured: Request | undefined;
      globalThis.fetch = async (
        input: RequestInfo | URL,
        init?: RequestInit,
      ): Promise<Response> => {
        captured = new Request(input, init);
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      };

      const response = await proxyBackend(
        new Request("http://localhost:3000/api/v1/health?verbose=1"),
        "/api/v1/health",
      );

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ok: true });
      assert.equal(captured?.headers.get("authorization"), "Bearer test-secret");
      assert.equal(captured?.url, "http://backend.test:9999/api/v1/health?verbose=1");
    },
  );
});

test("sends no Authorization header when no API key is configured", async () => {
  await withSettings({ API_KEY: "", API_HOST: "127.0.0.1", API_PORT: "8080" }, async () => {
    let captured: Request | undefined;
    globalThis.fetch = async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      captured = new Request(input, init);
      return new Response("{}", { status: 200 });
    };

    const response = await proxyBackend(
      new Request("http://localhost:3000/api/v1/status"),
      "/api/v1/status",
    );

    assert.equal(response.status, 200);
    assert.equal(captured?.headers.has("authorization"), false);
  });
});
