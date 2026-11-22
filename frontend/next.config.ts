import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The default dev-tools pill overlays the sidebar footer and intercepts clicks
  // on the theme toggle in dev/e2e. Errors are still surfaced without it.
  devIndicators: false,
  output: "standalone",
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
