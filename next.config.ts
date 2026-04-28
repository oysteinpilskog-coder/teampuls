import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Keep prefetched RSC payloads around longer so second/third visits to a
  // route are instant. The default for dynamic routes is 0s, which means every
  // tab-switch hits the server again.
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
    // Tree-shake barrel imports from heavy UI libs. Each entry tells Next to
    // rewrite `import { X } from 'pkg'` into a deep import so the bundler
    // doesn't pull the whole package into the client chunk.
    optimizePackageImports: [
      'lucide-react',
      'framer-motion',
      'date-fns',
      'date-holidays',
    ],
  },
};

export default nextConfig;
