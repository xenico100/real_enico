import path from "node:path";
import type { NextConfig } from "next";

const paypalClientId =
  process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ??
  process.env.PAYPAL_CLIENT_ID ??
  "";
const paypalCurrency =
  process.env.NEXT_PUBLIC_PAYPAL_CURRENCY ??
  process.env.PAYPAL_CURRENCY ??
  "USD";

const nextConfig: NextConfig = {
  reactCompiler: true,
  outputFileTracingRoot: path.resolve(__dirname),
  env: {
    NEXT_PUBLIC_PAYPAL_CLIENT_ID: paypalClientId,
    NEXT_PUBLIC_PAYPAL_CURRENCY: paypalCurrency,
  },
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
