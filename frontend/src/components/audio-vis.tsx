"use client";

import dynamic from "next/dynamic";

const AudioVisInner = dynamic(() => import("./audio-vis-inner"), {
  ssr: false,
  loading: () => (
    <div className="h-48 rounded-lg bg-card border border-border flex items-center justify-center">
      <p className="text-sm text-muted-foreground">Loading visualization...</p>
    </div>
  ),
});

export default function AudioVis() {
  return <AudioVisInner />;
}
