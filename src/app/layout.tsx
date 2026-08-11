import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import LayoutClient from "./LayoutClient";

// GA is no longer loaded here — this is a Server Component with no access
// to the visitor's cookie-consent choice (localStorage). LayoutClient
// renders <Analytics> (a Client Component) which loads GA only once the
// visitor accepts cookies. See src/lib/analyticsConfig.ts + src/components/Analytics.tsx.

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://www.studex.com.ng"),
  title: {
    default: "StudEx - Campus Marketplace",
    template: "%s | StudEx",
  },
  description:
    "Nigeria's #1 student campus marketplace. Order food, beauty, laundry, photography and more from verified vendors on campus. Fast, safe, affordable.",
  keywords: [
    "campus marketplace",
    "student services",
    "PAU marketplace",
    "Pan-Atlantic University",
    "student vendors",
    "lashes PAU",
    "nails PAU",
    "laundry PAU",
    "food delivery campus",
    "StudEx",
  ],
  authors: [{ name: "StudEx" }],
  creator: "StudEx",
  publisher: "StudEx",
  alternates: {
    canonical: "https://www.studex.com.ng",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  openGraph: {
    type: "website",
    locale: "en_NG",
    url: "https://www.studex.com.ng",
    siteName: "StudEx",
    title: "StudEx - Campus Marketplace",
    description:
      "Nigeria's #1 student campus marketplace. Order food, beauty, laundry, photography and more from verified vendors on campus.",
    images: [
      {
        url: "/images/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "StudEx — The Student Marketplace",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@studexng",
    title: "StudEx - Campus Marketplace",
    description: "Nigeria's #1 student campus marketplace for food, beauty, laundry & more.",
    images: ["/images/og-image.jpg"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico", type: "image/x-icon" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  manifest: "/site.webmanifest",
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "default",
    "apple-mobile-web-app-title": "StudEx",
    "instagram:site": "@studextechnologies",
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const isMaintenance = headersList.get("x-maintenance-page") === "1";

  return (
    <html lang="en" suppressHydrationWarning className="bg-[#FFF8F0]">
      <head>
        <meta name="theme-color" content="#7C3AED" />
        <link rel="preconnect" href="https://studex-backend-v2.onrender.com" />
        <link rel="preconnect" href="https://res.cloudinary.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://studex-backend-v2.onrender.com" />
        <link rel="dns-prefetch" href="https://res.cloudinary.com" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className={`${inter.className} bg-[#FFF8F0] text-gray-900`}>
        {isMaintenance ? children : <LayoutClient>{children}</LayoutClient>}
      </body>
    </html>
  );
}
