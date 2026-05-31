import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/home",
          "/categories",
          "/category/",
          "/listing/",
          "/vendor/",
          "/faq",
          "/terms",
          "/privacy-policy",
          "/auth",
          "/vendor/apply",
        ],
        disallow: [
          "/account/",
          "/admin/",
          "/vendor/dashboard/listings",
          "/vendor/dashboard/orders",
          "/vendor/dashboard/earnings",
          "/vendor/dashboard/",
          "/cart",
          "/checkout",
          "/wishlist",
          "/chat/",
          "/api/",
          "/success",
          "/order-confirmation/",
        ],
      },
    ],
    sitemap: "https://studex.com.ng/sitemap.xml",
  };
}
