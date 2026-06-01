import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import Script from "next/script";
import "./globals.css";
import LayoutClient from "./LayoutClient";

const GA_ID = "G-RZMK0KLZHB";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://www.studex.com.ng"),
  title: {
    default: "StudEx — Campus Marketplace for Students in Nigeria",
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
    title: "StudEx — Campus Marketplace for Students in Nigeria",
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
    title: "StudEx — Campus Marketplace for Students in Nigeria",
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
    <html lang="en" suppressHydrationWarning className="bg-[#FFF8F0] dark:bg-gray-950">
      <head>
        <meta name="theme-color" content="#7C3AED" />
      </head>
      <body className={`${inter.className} bg-[#FFF8F0] dark:bg-gray-950 text-gray-900 dark:text-gray-100`}>
        <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
        <Script id="ga4-init" strategy="afterInteractive">{`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_ID}');
        `}</Script>
        {isMaintenance ? children : <LayoutClient>{children}</LayoutClient>}
      </body>
    </html>
  );
}
