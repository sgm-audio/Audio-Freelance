import assert from "node:assert/strict";
import test from "node:test";

import { JsonClient } from "../src/lib/fetch-json.mts";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

test("caches successful GETs and clears deterministically", async () => {
  let calls = 0;
  const client = new JsonClient({
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse({ calls });
    },
  });

  assert.deepEqual(await client.get("/health"), { calls: 1 });
  assert.deepEqual(await client.get("/health"), { calls: 1 });
  assert.equal(calls, 1);

  client.clear();
  assert.deepEqual(await client.get("/health"), { calls: 2 });
});

test("deduplicates concurrent GETs", async () => {
  let calls = 0;
  const client = new JsonClient({
    fetchImpl: async () => {
      calls += 1;
      await Promise.resolve();
      return jsonResponse({ ok: true });
    },
  });

  const [first, second] = await Promise.all([
    client.get("/status"),
    client.get("/status"),
  ]);
  assert.deepEqual(first, { ok: true });
  assert.deepEqual(second, first);
  assert.equal(calls, 1);
});

test("does not cache HTTP errors", async () => {
  let calls = 0;
  const client = new JsonClient({
    fetchImpl: async () => {
      calls += 1;
      return calls === 1
        ? new Response("no", { status: 503, statusText: "Unavailable" })
        : jsonResponse({ ok: true });
    },
  });

  await assert.rejects(client.get("/health"), /503 Unavailable/);
  assert.deepEqual(await client.get("/health"), { ok: true });
  assert.equal(calls, 2);
});

test("aborts requests at the configured timeout", async () => {
  const client = new JsonClient({
    defaultTimeoutMs: 5,
    fetchImpl: (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      }),
  });

  await assert.rejects(client.get("/slow"), { name: "AbortError" });
});
