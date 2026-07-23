import type { NextConfig } from "next";

const API_HOST = process.env.API_HOST || "localhost";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: process.cwd(),
  },
  async rewrites() {
    // Only proxy /api/v1/* to FastAPI so Next handlers like /api/outreach stay local
    return [
      {
        source: "/api/v1/:path*",
        destination: `http://${API_HOST}:8080/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
