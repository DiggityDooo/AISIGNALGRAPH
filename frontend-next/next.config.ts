import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const sharedConfig: NextConfig = {
  images: { unoptimized: true },
  turbopack: {
    root: projectRoot,
  },
};

export default function nextConfig(phase: string): NextConfig {
  if (phase === PHASE_DEVELOPMENT_SERVER) {
    return {
      ...sharedConfig,
      async rewrites() {
        return [
          {
            source: "/api/:path*",
            destination: "http://localhost:8080/api/:path*",
          },
        ];
      },
    };
  }

  return {
    ...sharedConfig,
    output: "export",
  };
}
