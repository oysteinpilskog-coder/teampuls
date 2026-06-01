import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const withAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
  openAnalyzer: false,
});

const nextConfig: NextConfig = {
  devIndicators: false,
  // React Compiler — auto-memoizes components and values so we don't have to
  // sprinkle useMemo/useCallback/React.memo by hand. Stable in Next 16. Cost
  // is a slightly slower production build; runtime is faster everywhere it
  // catches a previously-unmemoized render.
  reactCompiler: true,
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
    ],
  },
};

export default withAnalyzer(nextConfig);
