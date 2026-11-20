import { proxyBackend } from "@/lib/backend-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Same-origin view of the backend's real SQLite pipeline snapshot. */
export function GET(request: Request): Promise<Response> {
  return proxyBackend(request, "/api/v1/outreach/status");
}
