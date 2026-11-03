import { NextResponse } from "next/server";
import { setOutreachPaused } from "@/lib/outreach-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { paused?: unknown };
    if (typeof body.paused !== "boolean") {
      return NextResponse.json(
        { error: "Body must include boolean paused" },
        { status: 400 },
      );
    }
    const result = setOutreachPaused(body.paused);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Kill switch failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
