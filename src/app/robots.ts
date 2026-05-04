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
          "/seller/onboarding",
        ],
        disallow: [
          "/account/",
          "/admin/",
          "/seller/listings",
          "/seller/orders",
          "/seller/payouts",
          "/seller/add",
          "/seller/edit/",
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
