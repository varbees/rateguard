import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: process.env.NEXT_PUBLIC_API_URL || "https://go-concurrent-aggregator.onrender.com/api/:path*",
      },
    ];
  },
};

export default nextConfig;
