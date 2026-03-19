// src/app/robots.ts
import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/home", "/shop", "/category", "/listing", "/faq"],
        disallow: [
          "/account",
          "/vendor",
          "/auth",
          "/api/",
          "/admin/",
          "/account/orders",
          "/account/bookings",
          "/wishlist",
        ],
      },
    ],
    sitemap: "https://studex.ng/sitemap.xml",
  };
}