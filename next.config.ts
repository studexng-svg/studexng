// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,

  typescript: {
    ignoreBuildErrors: true,
  },

  eslint: {
    ignoreDuringBuilds: true,
  },

  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "8000",
        pathname: "/media/**",
      },
      {
        protocol: "http",
        hostname: "localhost",
        port: "8000",
        pathname: "/media/**",
      },
      // Production backend — update hostname when you deploy Django
      {
        protocol: "https",
        hostname: "**",
        pathname: "/media/**",
      },
      {
        protocol: "http",
        hostname: "**",
        pathname: "/media/**",
      },
    ],
  },
};

export default nextConfig;