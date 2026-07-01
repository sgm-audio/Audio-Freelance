"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { fetchProfileStatus } from "@/lib/api";

export function FirstBootDetector() {
  const pathname = usePathname();
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // Only check on root/dashboard pages, not on setup itself
    if (pathname === "/setup") { setChecked(true); return; }
    if (checked) return;

    fetchProfileStatus()
      .then((status) => {
        if (!status.exists || status.is_empty) {
          if (pathname !== "/setup") router.push("/setup");
        }
      })
      .catch(() => {})
      .finally(() => setChecked(true));
  }, [pathname, router, checked]);

  return null;
}
