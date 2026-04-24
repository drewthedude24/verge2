import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone mode: bundles everything needed to run Next.js as a server.
  // Electron spawns this server in production so API routes (like /api/kai)
  // work correctly. In development, Next.js dev server handles everything.
  output: "standalone",

  images: {
    unoptimized: true,
  },
};

export default nextConfig;
