"use client";

/**
 * Last-resort boundary. Root error.tsx sits inside the root layout, so a throw
 * in the layout itself (or in AppShell) would otherwise fall back to a bare
 * dark page that looks like a black screen. This renders a usable recovery UI
 * even when the layout and its CSS have failed.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#171716",
          color: "#e8e6e2",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ maxWidth: 480, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, margin: "0 0 12px" }}>Something went wrong</h1>
          <p style={{ color: "#a8a6a1", fontSize: 14, wordBreak: "break-word" }}>
            {error.message || "An unexpected error occurred."}
          </p>
          {error.digest && (
            <p style={{ color: "#72706c", fontSize: 11, fontFamily: "monospace" }}>
              Error ID: {error.digest}
            </p>
          )}
          <button
            onClick={retry}
            style={{
              marginTop: 20,
              padding: "10px 18px",
              border: 0,
              borderRadius: 6,
              background: "#e8e6e2",
              color: "#171716",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
