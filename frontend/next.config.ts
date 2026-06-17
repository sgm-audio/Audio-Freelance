import type { NextConfig } from "next";

const API_HOST = process.env.API_HOST || "localhost";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: process.cwd(),
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `http://${API_HOST}:8080/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
