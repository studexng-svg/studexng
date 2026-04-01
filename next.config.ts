import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  images: {
    unoptimized: false,
    remotePatterns: [
      { protocol: "http", hostname: "127.0.0.1", port: "8000", pathname: "/media/**" },
      { protocol: "http", hostname: "localhost", port: "8000", pathname: "/media/**" },
      { protocol: "https", hostname: "res.cloudinary.com", pathname: "/**" },
      { protocol: "https", hostname: "studex-backend-v2.onrender.com", pathname: "/media/**" },
      { protocol: "https", hostname: "**.onrender.com", pathname: "/media/**" },
    ],
  },
};

export default nextConfig;