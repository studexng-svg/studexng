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

  const hideNav =
    pathname === "/" ||
    pathname === "/auth" ||
    pathname === "/maintenance" ||
    pathname?.startsWith("/admin");

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
