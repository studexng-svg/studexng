// src/components/layout/BottomNav.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Home, Grid3x3, ShoppingCart, MessageCircle, User, ArrowRight } from "lucide-react";
import Image from "next/image";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/authStore";
import { useCart } from "@/lib/cartStore";
import { api } from "@/lib/api";
import { TEAL } from "@/lib/tokens";

const navItems = [
  { href: "/home",       icon: Home,          label: "Home"     },
  { href: "/categories", icon: Grid3x3,       label: "Shop"     },
  { href: "/cart",       icon: ShoppingCart,  label: "Cart"     },
  { href: "/chat",       icon: MessageCircle, label: "Messages" },
  { href: "/account",   icon: User,          label: "Account"  },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { isLoggedIn } = useAuth();
  const { cart } = useCart();
  const [unreadCount, setUnreadCount] = useState(0);
  const showCheckout = cart.length > 0 && !pathname.startsWith("/cart") && !pathname.startsWith("/checkout");

  // Poll unread count every 30s — must be before early returns (Rules of Hooks)
  useEffect(() => {
    if (!isLoggedIn) return;
    const fetchUnread = async () => {
      try {
        const res = await api.chat.conversations();
        if (!res.ok) return;
        const data = await res.json();
        const convs = data.results || data;
        const total = convs.reduce((sum: number, c: any) => sum + (c.unread_count || 0), 0);
        setUnreadCount(total);
      } catch {}
    };
    fetchUnread();
    const interval = setInterval(() => { if (document.visibilityState !== 'hidden') fetchUnread(); }, 30000);
    return () => clearInterval(interval);
  }, [isLoggedIn]);

  // Hide on auth/admin pages and individual chat rooms (but show on /chat list)
  if (pathname === "/" || pathname === "/auth" || pathname.startsWith("/admin") || pathname.startsWith("/chat/")) {
    return null;
  }

  return (
    <>
    {/* Floating checkout button — appears above bottom nav when cart has items */}
    <AnimatePresence>
      {showCheckout && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ type: "spring", stiffness: 420, damping: 28 }}
          className="fixed bottom-[88px] left-4 right-4 z-50 max-w-lg mx-auto"
        >
          <Link href="/checkout">
            <motion.button
              animate={{ scale: [1, 1.025, 1] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              className="w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-between px-5 shadow-lg"
              style={{ background: TEAL, boxShadow: `0 8px 28px rgba(13,148,136,0.45)` }}
            >
              <span className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5" />
                Checkout
              </span>
              <span className="flex items-center gap-2">
                <span className="bg-white/20 rounded-full px-2.5 py-0.5 text-sm font-black">
                  {cart.length} {cart.length === 1 ? "item" : "items"}
                </span>
                <ArrowRight className="w-5 h-5" />
              </span>
            </motion.button>
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
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          const isChat = item.href === "/chat";

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
                  {isChat && unreadCount > 0 && (
                    <div className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-red-500 rounded-full flex items-center justify-center px-1">
                      <span className="text-white text-xs font-black leading-none">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    </div>
                  )}
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
