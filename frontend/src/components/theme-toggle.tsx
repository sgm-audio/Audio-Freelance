"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

export function ThemeToggle() {
  // next-themes reads persisted state on the client; defer controls to avoid hydration drift.
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const { resolvedTheme, setTheme } = useTheme();

  if (!mounted) return <div className="h-6" />;

  return (
    <div className="flex items-center justify-between text-xs">
      <button
        onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        className="px-2 py-1 rounded hover:bg-accent transition-colors cursor-pointer"
        title="Toggle theme"
        aria-label={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} theme`}
      >
        <span className="text-sm">☀</span> / <span className="text-sm">☾</span>
      </button>
      <span className="text-muted-foreground">Theme</span>
    </div>
  );
}
