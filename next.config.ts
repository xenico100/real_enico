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
  reactCompiler: false,
  outputFileTracingRoot: path.resolve(__dirname),
  experimental: {
    webpackBuildWorker: false,
  },
  env: {
    NEXT_PUBLIC_PAYPAL_CLIENT_ID: paypalClientId,
    NEXT_PUBLIC_PAYPAL_CURRENCY: paypalCurrency,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
        ],
      },
      {
        source: '/admin/:path*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
        ],
      },
      {
        source: '/api/admin/:path*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
        ],
      },
    ];
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
