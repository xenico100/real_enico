import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  outputFileTracingRoot: path.resolve(__dirname),
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "pub-11768089b4c8464da58cf12287bef2fa.r2.dev" },
      { protocol: "https", hostname: "gkfupegrduencknzpzok.supabase.co" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "dummyimage.com" },
    ],
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 31536000,
  },
};

export default nextConfig;
