import { proxyBackend } from "@/lib/backend-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Forward the kill switch to the backend; it validates the body and owns the DB write. */
export function POST(request: Request): Promise<Response> {
  return proxyBackend(request, "/api/v1/outreach/pause");
}
