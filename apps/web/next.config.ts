import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Do not compress proxied responses so Server-Sent Events stream unbuffered.
  compress: false,
  async rewrites() {
    const apiTarget = process.env.API_PROXY_TARGET ?? "http://localhost:8080";
    const workerTarget = process.env.WORKER_PROXY_TARGET ?? "http://localhost:9100";
    return [
      {
        source: "/backend/:path*",
        destination: `${apiTarget}/api/:path*`,
      },
      {
        source: "/worker/:path*",
        destination: `${workerTarget}/:path*`,
      },
    ];
  },
};

export default nextConfig;
