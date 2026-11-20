import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Server-side proxy for FastAPI. The browser only talks to Next.js, so the
 * backend API key is injected here and never appears in client code or HTML.
 */

const HOP_BY_HOP_HEADERS = new Set([
  "authorization",
  "connection",
  "content-encoding",
  "content-length",
  "host",
  "transfer-encoding",
]);

/** Read a setting from the process environment, falling back to the root .env. */
export function backendSetting(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  try {
    // Next runs from <root>/frontend; the shared .env lives one level up.
    const envPath = path.resolve(process.cwd(), "..", ".env");
    const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
    // dotenv uses the last definition when a key is declared more than once.
    const line = lines.filter((entry) => entry.startsWith(`${name}=`)).at(-1);
    if (!line) return undefined;
    const raw = line.slice(line.indexOf("=") + 1).trim();
    const value = raw.replace(/^(['"])(.*)\1$/, "$2");
    return value || undefined;
  } catch {
    return undefined;
  }
}

function backendUrl(request: Request, backendPath: string): string {
  const host = backendSetting("API_HOST") || "127.0.0.1";
  const port = backendSetting("API_PORT") || "8080";
  const search = new URL(request.url).search;
  return `http://${host}:${port}${backendPath}${search}`;
}

function forwardedHeaders(request: Request, apiKey: string | undefined): Headers {
  const headers = new Headers();
  for (const [name, value] of request.headers) {
    const lower = name.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower) || lower === "accept-encoding") continue;
    headers.set(name, value);
  }
  if (apiKey) headers.set("authorization", `Bearer ${apiKey}`);
  return headers;
}

export async function proxyBackend(
  request: Request,
  backendPath: string,
): Promise<Response> {
  const method = request.method.toUpperCase();
  const body = method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();

  let response: Response;
  try {
    response = await fetch(backendUrl(request, backendPath), {
      method,
      headers: forwardedHeaders(request, backendSetting("API_KEY")),
      body,
      cache: "no-store",
      redirect: "manual",
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Backend unavailable";
    return Response.json({ error: "backend_unavailable", detail }, { status: 502 });
  }

  const headers = new Headers(response.headers);
  for (const name of ["connection", "content-length", "transfer-encoding"]) {
    headers.delete(name);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
