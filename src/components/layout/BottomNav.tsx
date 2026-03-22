// src/components/layout/BottomNav.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Home, Grid3x3, ShoppingCart, MessageCircle, User } from "lucide-react";
import Image from "next/image";
import { useState, useEffect } from "react";
import { useAuth, fetchWithAuth } from "@/lib/authStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

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
  const [unreadCount, setUnreadCount] = useState(0);

  if (pathname === "/" || pathname === "/auth" || pathname.startsWith("/admin")) {
    return null;
  }

  // Poll unread count every 30s
  useEffect(() => {
    if (!isLoggedIn) return;
    const fetchUnread = async () => {
      try {
        const res = await fetchWithAuth(`${API_URL}/api/chat/conversations/`);
        if (!res.ok) return;
        const data = await res.json();
        const convs = data.results || data;
        const total = convs.reduce((sum: number, c: any) => sum + (c.unread_count || 0), 0);
        setUnreadCount(total);
      } catch {}
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, [isLoggedIn]);

  return (
    <div className="fixed bottom-0 left-0 right-0 w-full bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 shadow-2xl z-50">
      <div className="flex justify-around items-center px-2 py-3 max-w-full">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          const isChat = item.href === "/chat";

          return (
            <Link key={item.href} href={item.href} className="flex flex-col items-center justify-center min-w-0 flex-1">
              <motion.div whileTap={{ scale: 0.9 }} className="flex flex-col items-center gap-1 w-full relative">
                {isActive && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute inset-0 bg-purple-100/50 dark:bg-purple-900/30 rounded-xl -z-10"
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
                <motion.div
                  animate={{ scale: isActive ? 1.1 : 1, y: isActive ? -2 : 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  className="relative"
                >
                  <Icon
                    className="w-7 h-7"
                    strokeWidth={isActive ? 2.5 : 2}
                    stroke={isActive ? "#7C3AED" : "currentColor"}
                    fill={isActive ? "#7C3AED" : "none"}
                  />
                  {isChat && unreadCount > 0 && (
                    <div className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-red-500 rounded-full flex items-center justify-center px-1">
                      <span className="text-white text-[9px] font-black leading-none">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    </div>
                  )}
                </motion.div>
                <span className={`text-xs font-semibold mt-1 ${isActive ? "text-purple-600 dark:text-purple-400" : "text-gray-500 dark:text-gray-400"}`}>
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
        className="absolute -top-4 left-1/2 -translate-x-1/2 w-14 h-14 bg-white dark:bg-gray-800 rounded-full shadow-2xl border-4 border-white dark:border-gray-800 flex items-center justify-center"
      >
        <Image src="/images/logo-1.jpg" alt="StudEx" width={48} height={48} className="w-12 h-12 rounded-full object-cover" />
      </Link>
    </div>
  );
}
