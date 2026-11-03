"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { fetchProfileStatus } from "@/lib/api";

export function FirstBootDetector() {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    // Only check on root/dashboard pages, not on setup itself
    if (pathname === "/setup") return;

    fetchProfileStatus()
      .then((status) => {
        if (!status.exists || status.is_empty) {
          if (pathname !== "/setup") router.push("/setup");
        }
      })
      .catch(() => {});
  }, [pathname, router]);

  return null;
}
