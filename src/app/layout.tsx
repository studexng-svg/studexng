// src/app/layout.tsx
"use client";

import "./globals.css";
import { Inter } from "next/font/google";
import BottomNav from "@/components/layout/BottomNav";
import CookieConsent from "@/components/CookieConsent";
import { Toaster } from "@/components/ui/sonner";
import { usePathname } from "next/navigation";
import { ThemeProvider } from "@/components/ThemeProvider";
import { useEffect, useState } from "react";

const inter = Inter({ subsets: ["latin"] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const hideNav =
    pathname === "/" ||
    pathname === "/auth" ||
    pathname?.startsWith("/admin");

  if (!mounted) {
    return (
      <html lang="en" suppressHydrationWarning>
        <body className={`${inter.className} bg-background text-foreground`}>
          <main className="min-h-screen" />
        </body>
      </html>
    );
  }

  return (
    <html lang="en" suppressHydrationWarning className="bg-[#FFF8F0] dark:bg-gray-950">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="theme-color" content="#7C3AED" />
        <meta name="description" content="Nigeria's #1 campus marketplace. Book lashes, nails, laundry, food and more from verified student vendors at Pan-Atlantic University. Fast, safe, and affordable." />
        <meta name="keywords" content="campus marketplace, student services, PAU marketplace, Pan-Atlantic University, student vendors, lashes PAU, nails PAU, laundry PAU, food delivery campus, StudEx, studex.ng" />
        <meta name="robots" content="index, follow" />

        <meta property="og:site_name" content="StudEx" />
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="en_NG" />
        <meta property="og:url" content="https://studex.ng" />
        <meta property="og:title" content="StudEx — The Student Marketplace" />
        <meta property="og:description" content="Book lashes, nails, laundry, food and more from verified student vendors at PAU." />
        <meta property="og:image" content="/images/og-image.jpg" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:site" content="@studexng" />
        <meta name="twitter:title" content="StudEx — The Student Marketplace" />
        <meta name="twitter:description" content="Nigeria's #1 campus marketplace for student services." />
        <meta name="twitter:image" content="/images/og-image.jpg" />

        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="StudEx" />

        <link rel="icon" type="image/x-icon" href="/favicon.ico" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/site.webmanifest" />
        <link rel="canonical" href="https://studex.ng" />

        <title>StudEx — The Student Marketplace | Pan-Atlantic University</title>
      </head>
      <body className={`${inter.className} bg-[#FFF8F0] dark:bg-gray-950 text-gray-900 dark:text-gray-100`}>
        <ThemeProvider>
          <main className={hideNav ? "min-h-screen bg-[#FFF8F0] dark:bg-gray-950" : "min-h-screen bg-[#FFF8F0] dark:bg-gray-950 pb-[5.5rem]"}>
            {children}
          </main>

          {!hideNav && (
            <div className="fixed inset-x-0 bottom-0 z-50">
              <BottomNav />
            </div>
          )}

          <CookieConsent />
          <Toaster position="top-center" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
