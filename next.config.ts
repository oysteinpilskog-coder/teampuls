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
  },
};

export default nextConfig;
