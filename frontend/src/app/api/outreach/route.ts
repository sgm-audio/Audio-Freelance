import { NextResponse } from "next/server";
import { loadOutreachSnapshot } from "@/lib/outreach-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = loadOutreachSnapshot();
    return NextResponse.json(snapshot);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read outreach DB";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
