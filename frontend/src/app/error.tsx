"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("Uncaught error:", error);
  }, [error]);

  return (
    <div className="max-w-lg mx-auto mt-16 text-center">
      <div className="text-6xl mb-6 text-destructive">⚠</div>
      <h1 className="text-2xl font-semibold tracking-tight mb-3">Something went wrong</h1>
      <p className="text-muted-foreground mb-2">
        {error.message || "An unexpected error occurred."}
      </p>
      {error.digest && (
        <p className="text-xs text-muted-foreground mb-6 font-mono">
          Error ID: {error.digest}
        </p>
      )}
      <div className="flex justify-center gap-3">
        <button
          onClick={unstable_retry}
          className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm hover:opacity-90 transition-opacity"
        >
          Try again
        </button>
        <a
          href="/"
          className="rounded-md border border-border bg-card px-4 py-2 text-sm hover:bg-accent transition-colors"
        >
          Go to Dashboard
        </a>
      </div>
      <p className="text-xs text-muted-foreground mt-8">
        If this persists, check that the backend is running (<code className="bg-muted rounded px-1 py-0.5">./run.sh</code>).
      </p>
    </div>
  );
}
