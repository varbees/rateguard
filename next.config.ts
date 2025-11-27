import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  async rewrites() {
    // Get backend URL from env, default to Render production URL
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || "https://go-concurrent-aggregator.onrender.com";
    
    return [
      {
        source: "/api/:path*",
        // The :path* captures everything after /api/, so we reconstruct the full path
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
