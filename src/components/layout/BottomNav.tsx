// src/components/layout/BottomNav.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Home, Grid3x3, ShoppingCart, ClipboardList, User } from "lucide-react";
import Image from "next/image";
import { useCart } from "@/lib/cartStore";
import { TEAL } from "@/lib/tokens";

const navItems = [
  { href: "/home",          icon: Home,          label: "Home"   },
  { href: "/categories",    icon: Grid3x3,       label: "Shop"   },
  { href: "/cart",          icon: ShoppingCart,  label: "Cart"   },
  { href: "/account/orders", icon: ClipboardList, label: "Orders" },
  { href: "/account",       icon: User,          label: "Account" },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { cart } = useCart();
  const showCheckout = cart.length > 0 && pathname === "/home";

  // Checkout itself only scopes to one vendor when it gets a ?vendor= param
  // (see checkout/page.tsx) — a cart spanning several vendors (e.g. a Store
  // item + a marketplace item) must go through /cart's per-vendor grouping
  // instead of jumping straight past it into an unscoped, mixed-vendor
  // checkout.
  const vendorIds = new Set(cart.map(i => i.vendorId).filter((id): id is number => id != null));
  const checkoutHref = vendorIds.size > 1 ? "/cart" : vendorIds.size === 1 ? `/checkout?vendor=${[...vendorIds][0]}` : "/checkout";

  // Hide on auth/admin/rider pages, individual chat rooms, and the vendor
  // dashboard (which has its own dedicated nav — /vendor/[username], the
  // public storefront, is intentionally NOT excluded here since buyers
  // still need Home/Shop/Cart there).
  if (pathname === "/" || pathname === "/auth" || pathname.startsWith("/admin") || pathname.startsWith("/chat") || pathname.startsWith("/rider") || pathname.startsWith("/vendor/dashboard")) {
    return null;
  }

  // Longest-prefix match — resolves the ambiguity where a nested route like
  // /account/orders matches both the "Orders" (/account/orders) and "Account"
  // (/account) hrefs; only the more specific one should ever light up.
  const activeHref = navItems
    .filter((i) => pathname === i.href || pathname.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <>
    {/* Floating checkout FAB — home page only, bottom-right, periodic shake */}
    <AnimatePresence>
      {showCheckout && (
        <motion.div
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 22 }}
          className="fixed bottom-[100px] right-4 z-50"
        >
          <Link href={checkoutHref}>
            <button
              className="animate-buzz relative w-14 h-14 rounded-full flex items-center justify-center text-white"
              style={{ background: TEAL, boxShadow: `0 6px 24px rgba(13,148,136,0.55)` }}
            >
              <ShoppingCart className="w-6 h-6" />
              <span className="absolute -top-1 -right-1 min-w-[20px] h-5 bg-red-500 rounded-full flex items-center justify-center px-1 text-xs font-black text-white leading-none">
                {cart.length > 9 ? "9+" : cart.length}
              </span>
            </button>
          </Link>
        </motion.div>
      )}
    </AnimatePresence>

    <div className="fixed bottom-4 left-4 right-4 rounded-2xl z-50 max-w-lg mx-auto"
      style={{
        background: "#ffffff",
        border: "1px solid rgba(0,0,0,0.06)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.10), 0 1.5px 8px rgba(0,0,0,0.06)",
      }}>
      <div className="flex justify-around items-center px-2 py-3 max-w-full">
        {navItems.map((item) => {
          const isActive = item.href === activeHref;
          const Icon = item.icon;

          return (
            <Link key={item.href} href={item.href} className="flex flex-col items-center justify-center min-w-0 flex-1">
              <motion.div whileTap={{ scale: 0.9 }} className="flex flex-col items-center gap-1 w-full relative">
                <motion.div
                  animate={{ scale: isActive ? 1.1 : 1, y: isActive ? -2 : 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  className="relative"
                >
                  <Icon
                    className="w-7 h-7"
                    strokeWidth={isActive ? 2.5 : 2}
                    stroke={isActive ? "#0D9488" : "rgba(120,113,108,0.6)"}
                    fill={isActive ? "#0D9488" : "none"}
                  />
                </motion.div>
                <span className={`text-xs font-semibold mt-1 ${isActive ? "text-teal-600" : "text-stone-400"}`}>
                  {item.label}
                </span>
              </motion.div>
            </Link>
          );
        })}
      </div>

      {/* Floating Logo */}
      <Link
        href="/cart"
        className="absolute -top-4 left-1/2 -translate-x-1/2 w-14 h-14 rounded-full flex items-center justify-center"
        style={{
          background: "#ffffff",
          border: "1px solid rgba(0,0,0,0.06)",
          boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
        }}
      >
        <Image src="/images/logo-1.jpg" alt="StudEx" width={48} height={48} className="w-10 h-10 rounded-full object-cover" />
      </Link>
    </div>
    </>
  );
}
