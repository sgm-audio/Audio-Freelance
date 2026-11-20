"use client";

import {
  emptyOutreachSnapshot,
  fetchOutreachSnapshot,
  type OutreachSnapshot,
} from "@/lib/outreach-db";
import { OutreachConsole } from "./outreach-console";
import { Syne, IBM_Plex_Mono } from "next/font/google";
import { useEffect, useState } from "react";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-sgm-display",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sgm-mono",
  display: "swap",
});

export default function OutreachClient() {
  const [snapshot, setSnapshot] = useState<OutreachSnapshot>(() =>
    emptyOutreachSnapshot("loading"),
  );

  useEffect(() => {
    let active = true;
    fetchOutreachSnapshot()
      .then((snap) => {
        if (active) setSnapshot(snap);
      })
      .catch(() => {
        if (active) setSnapshot(emptyOutreachSnapshot("unavailable"));
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className={`${syne.variable} ${plexMono.variable} sgm-outreach`}>
      <OutreachConsole initial={snapshot} />
    </div>
  );
}
