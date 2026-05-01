import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
  devIndicators: {
    buildActivity: false,
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `http://localhost:${process.env.PORT || 8080}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
