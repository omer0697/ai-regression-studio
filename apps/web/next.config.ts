import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Do not compress proxied responses so Server-Sent Events stream unbuffered.
  compress: false,
  async rewrites() {
    const target = process.env.API_PROXY_TARGET ?? "http://localhost:8080";
    return [
      {
        source: "/backend/:path*",
        destination: `${target}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
