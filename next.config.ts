import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  poweredByHeader: false,
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },

  compress: true,

  modularizeImports: {
    "lucide-react": {
      transform: "lucide-react/dist/esm/icons/{{kebabCase member}}",
    },
  },

  images: {
    unoptimized: false,
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 3600,
    remotePatterns: [
      { protocol: "http", hostname: "127.0.0.1", port: "8000", pathname: "/media/**" },
      { protocol: "http", hostname: "localhost", port: "8000", pathname: "/media/**" },
      { protocol: "https", hostname: "res.cloudinary.com", pathname: "/**" },
      { protocol: "https", hostname: "studex-backend-v2.onrender.com", pathname: "/media/**" },
      { protocol: "https", hostname: "**.onrender.com", pathname: "/media/**" },
    ],
  },

  async headers() {
    return [
      {
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/_next/image/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" },
        ],
      },
      {
        source: "/images/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/icons/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;