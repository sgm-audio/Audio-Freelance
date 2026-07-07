"use client";

export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <div className="max-w-lg mx-auto mt-16 text-center">
      <div className="text-5xl mb-4 text-destructive">⚠</div>
      <h1 className="text-xl font-semibold mb-2">Could not load this page</h1>
      <p className="text-sm text-muted-foreground mb-1">{error.message}</p>
      {error.digest && <p className="text-xs text-muted-foreground/60 mb-4 font-mono">ID: {error.digest}</p>}
      <div className="flex justify-center gap-3">
        <button onClick={unstable_retry} className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm">
          Retry
        </button>
        <a href="/" className="rounded-md border border-border bg-card px-4 py-2 text-sm hover:bg-accent">
          Dashboard
        </a>
      </div>
    </div>
  );
}
