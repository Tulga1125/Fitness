import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Photos are uploaded through server actions; tickets from phones can be several MB.
  experimental: { serverActions: { bodySizeLimit: "15mb" } },
  // This app lives in a subfolder of another repository for now; pin the tracing root to it.
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;
