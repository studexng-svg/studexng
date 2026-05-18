"use client";

import BottomNav from "@/components/layout/BottomNav";
import CookieConsent from "@/components/CookieConsent";
import { Toaster } from "@/components/ui/sonner";
import { usePathname } from "next/navigation";
import { ThemeProvider } from "@/components/ThemeProvider";
import { useEffect, useState } from "react";
import { useNotifications } from "@/hooks/useNotifications";
import { NotificationToastContainer } from "@/components/NotificationToast";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import AdminBar from "@/components/AdminBar";
import { useHeartbeat } from "@/hooks/useHeartbeat";

function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { toasts, dismissToast } = useNotifications();
  usePushNotifications();
  useHeartbeat();
  return (
    <>
      {children}
      <NotificationToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}

export default function LayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Save scroll position when leaving a page; restore it when coming back
  useEffect(() => {
    const key = `scroll:${pathname}`;
    const saved = sessionStorage.getItem(key);
    const timers: ReturnType<typeof setTimeout>[] = [];

    if (saved) {
      sessionStorage.removeItem(key);
      const y = parseInt(saved, 10);
      if (y > 0) {
        // Try at 100ms, 300ms, and 600ms — pages with API fetches need the later attempts
        const attempt = () => window.scrollTo({ top: y, behavior: "instant" });
        timers.push(setTimeout(attempt, 100));
        timers.push(setTimeout(attempt, 300));
        timers.push(setTimeout(attempt, 600));
      }
    }

    return () => {
      timers.forEach(clearTimeout);
      if (window.scrollY > 0) sessionStorage.setItem(key, String(window.scrollY));
    };
  }, [pathname]);

  const hideNav =
    pathname === "/" ||
    pathname === "/auth" ||
    pathname === "/maintenance" ||
    pathname?.startsWith("/admin") ||
    pathname?.startsWith("/seller");

  if (!mounted) {
    return <main className="min-h-screen" />;
  }

  return (
    <ThemeProvider>
      <NotificationProvider>
        <main
          className={
            hideNav
              ? "min-h-screen bg-[#FFF8F0] dark:bg-gray-950"
              : "min-h-screen bg-[#FFF8F0] dark:bg-gray-950 pb-[5.5rem]"
          }
        >
          {children}
        </main>

        {!hideNav && (
          <div className="fixed inset-x-0 bottom-0 z-50">
            <BottomNav />
          </div>
        )}

        <AdminBar />
        <CookieConsent />
        <Toaster position="top-center" richColors closeButton />
      </NotificationProvider>
    </ThemeProvider>
  );
}
