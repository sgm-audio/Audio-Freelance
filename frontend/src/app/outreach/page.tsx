import type { Metadata } from "next";
import OutreachClient from "./outreach-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "SGM Outreach Engine",
  description: "Operator console for the SGM outreach pipeline — funnel, approvals, kill switch.",
};

export default function OutreachPage() {
  return <OutreachClient />;
}