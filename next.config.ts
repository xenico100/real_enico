import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  outputFileTracingRoot: path.resolve(__dirname),
};

export default nextConfig;
