"use client";

import BottomNav from "@/components/layout/BottomNav";
import SiteHeader from "@/components/layout/SiteHeader";
import CookieConsent from "@/components/CookieConsent";
import { Toaster } from "@/components/ui/sonner";
import { usePathname } from "next/navigation";
import { ThemeProvider } from "@/components/ThemeProvider";
import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useCart } from "@/lib/cartStore";
import { useWishlistStore } from "@/lib/wishlistStore";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/authStore";
import { useNotifications } from "@/hooks/useNotifications";
import { NotificationToastContainer } from "@/components/NotificationToast";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import DraggableAdminShield from "@/components/admin/DraggableAdminShield";
import { useHeartbeat } from "@/hooks/useHeartbeat";
import NavigationProgress from "@/components/NavigationProgress";
import PushNotificationPrompt from "@/components/PushNotificationPrompt";

function CartWishlistSync() {
  const { isLoggedIn, accessToken } = useAuth();

  const { data: cartData } = useQuery({
    queryKey: ["cart"],
    queryFn: async () => {
      const res = await api.cart.get();
      if (!res.ok) throw new Error("cart fetch failed");
      return res.json() as Promise<Array<{
        listing_id: number; title: string; price: string | number;
        effective_price?: string | number; deal_discount_percent?: number;
        img: string; quantity: number;
      }>>;
    },
    enabled: isLoggedIn && !!accessToken,
    staleTime: 0,
  });

  const { data: wishlistData } = useQuery({
    queryKey: ["wishlist"],
    queryFn: async () => {
      const res = await api.wishlist.get();
      if (!res.ok) throw new Error("wishlist fetch failed");
      return res.json() as Promise<Array<{
        listing_id: number; title: string; price: string | number; img: string;
      }>>;
    },
    enabled: isLoggedIn && !!accessToken,
    staleTime: 0,
  });

  useEffect(() => {
    if (!cartData) return;
    useCart.setState({
      cart: cartData.map(item => {
        const originalPrice = parseFloat(String(item.price));
        const effectivePrice = item.effective_price != null
          ? parseFloat(String(item.effective_price))
          : originalPrice;
        const hasDeal = effectivePrice < originalPrice;
        return {
          id: item.listing_id,
          title: item.title,
          price: effectivePrice,
          ...(hasDeal ? { original_price: originalPrice } : {}),
          deal_discount_percent: item.deal_discount_percent ?? 0,
          img: item.img || "",
          quantity: item.quantity,
        };
      }),
    });
  }, [cartData]);

  useEffect(() => {
    if (!wishlistData) return;
    useWishlistStore.setState({
      wishlist: wishlistData.map(item => ({
        id: item.listing_id,
        title: item.title,
        price: parseFloat(String(item.price)),
        img: item.img || "",
      })),
    });
  }, [wishlistData]);

  return null;
}

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
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 60_000 } } }));

  useEffect(() => {
    setMounted(true);
    // Take manual control so the browser doesn't override our sessionStorage restoration
    if (typeof history !== "undefined") {
      history.scrollRestoration = "manual";
    }
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
        // Retry at increasing intervals — later attempts handle pages that load API data slowly
        const attempt = () => window.scrollTo({ top: y, behavior: "instant" });
        timers.push(setTimeout(attempt, 80));
        timers.push(setTimeout(attempt, 250));
        timers.push(setTimeout(attempt, 600));
        timers.push(setTimeout(attempt, 1200));
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

  // SiteHeader is desktop-only; hide on pages that have their own header
  const hideHeader =
    hideNav ||
    pathname === "/home" ||
    pathname?.startsWith("/vendor/dashboard");

  if (!mounted) {
    return <main className="min-h-screen" />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <NotificationProvider>
          <NavigationProgress />
          <CartWishlistSync />
          {/* SiteHeader removed — TopNav handles all non-home pages on all screen sizes */}
          <main
            className={
              hideNav
                ? "min-h-screen bg-[#F5F5F5] dark:bg-gray-950"
                : "min-h-screen bg-[#F5F5F5] dark:bg-gray-950 pb-28"
            }
          >
            {children}
          </main>

          {!hideNav && <BottomNav />}

          <PushNotificationPrompt />
          <DraggableAdminShield />
          <CookieConsent />
          <Toaster position="top-center" richColors closeButton />
        </NotificationProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
