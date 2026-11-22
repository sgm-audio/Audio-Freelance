"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { fetchProfileStatus } from "@/lib/api";

export function FirstBootDetector() {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    // Only nudge first-time users from the dashboard. Force-redirecting from
    // every route made other pages look like dead ends before setup finished.
    if (pathname !== "/") return;

    fetchProfileStatus()
      .then((status) => {
        if (!status.exists || status.is_empty) {
          router.push("/setup");
        }
      })
      // Backend down is not a reason to redirect; the page renders its own
      // connection error state instead.
      .catch(() => {});
  }, [pathname, router]);

  return null;
}
