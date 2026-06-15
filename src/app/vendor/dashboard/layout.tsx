"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/authStore";
import { GRAD, GRAD_DARK } from "@/lib/tokens";
import { api } from "@/lib/api";
import {
  MessageCircle, Calendar, DollarSign, Package, ShoppingBag,
  Star, ArrowLeft, Link2, Share2, Check, History, MessageSquare,
} from "lucide-react";

const TABS = [
  { id: "messages",  label: "Messages",  icon: MessageCircle, href: "/vendor/dashboard/messages"  },
  { id: "bookings",  label: "Bookings",  icon: Calendar,      href: "/vendor/dashboard/bookings"  },
  { id: "listings",  label: "Listings",  icon: Package,       href: "/vendor/dashboard/listings"  },
  { id: "orders",    label: "Orders",    icon: ShoppingBag,   href: "/vendor/dashboard/orders"    },
  { id: "history",   label: "History",   icon: History,       href: "/vendor/dashboard/history"   },
  { id: "earnings",  label: "Earnings",  icon: DollarSign,    href: "/vendor/dashboard/earnings"  },
  { id: "reviews",   label: "Reviews",   icon: Star,          href: "/vendor/dashboard/reviews"   },
  { id: "feedback",  label: "Feedback",  icon: MessageSquare, href: "/vendor/dashboard/feedback"  },
];

export default function VendorDashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoggedIn, isHydrated } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [linkCopied, setLinkCopied] = useState(false);
  const [msgBadge, setMsgBadge] = useState(0);
  const [bookingBadge, setBookingBadge] = useState(0);

  useEffect(() => {
    if (!isHydrated) return;
    if (!isLoggedIn) { router.push("/auth"); return; }
    if (!user?.is_verified_vendor) { router.push("/vendor/apply"); return; }
  }, [isHydrated, isLoggedIn, user]);

  useEffect(() => {
    if (!user) return;
    api.chat.conversations()
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        const list = Array.isArray(d) ? d : (d.results || []);
        setMsgBadge(list.reduce((s: number, c: any) => s + (c.unread_count || 0), 0));
      }).catch(() => {});
    api.orders.bookings()
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        const list = Array.isArray(d) ? d : (d.results || []);
        const vendorOnly = list.filter((b: any) => b.vendor_username === user?.username);
        setBookingBadge(vendorOnly.filter((b: any) => b.status === "pending").length);
      }).catch(() => {});
  }, [user]);

  const badges: Record<string, number> = { messages: msgBadge, bookings: bookingBadge };

  return (
    <div className="min-h-screen bg-[#F5F5F5] flex flex-col" style={{ fontFamily: "'DM Sans', sans-serif" }}>

      {/* Sticky header + tab bar */}
      <div className="sticky top-0 z-40 flex-shrink-0">

        {/* Gradient header */}
        <div className="relative overflow-hidden" style={{ background: GRAD_DARK }}>
          <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, rgba(13,148,136,0.28) 0%, rgba(124,58,237,0.45) 100%)" }} />
          <div className="relative z-10 max-w-5xl mx-auto px-4 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => router.back()}
                className="p-2 rounded-full transition-all active:scale-95 flex-shrink-0"
                style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.22)" }}>
                <ArrowLeft className="w-4 h-4 text-white" />
              </button>
              <div>
                <p className="text-white/50 text-xs tracking-[0.25em] uppercase font-bold leading-none mb-0.5">Vendor Hub</p>
                <h1 className="text-white font-black text-base tracking-tight leading-none">
                  {user?.username || "Dashboard"}
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {user?.profile?.vendor_badge && user.profile.vendor_badge !== "none" && (
                <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full"
                  style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.25)", color: "white" }}>
                  {user.profile.vendor_badge === "top" ? "🏆 Top" : user.profile.vendor_badge === "trusted" ? "✅ Trusted" : "⭐ Rising"}
                </span>
              )}
              {user?.profile_image ? (
                <img src={user.profile_image} alt={user.username}
                  className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                  style={{ border: "2px solid rgba(255,255,255,0.35)" }} />
              ) : (
                <div className="w-9 h-9 rounded-full flex items-center justify-center font-black text-white text-sm flex-shrink-0"
                  style={{ background: "rgba(255,255,255,0.18)", border: "2px solid rgba(255,255,255,0.3)" }}>
                  {(user?.username?.[0] || "V").toUpperCase()}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div className="bg-white border-b border-stone-100 overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:hidden">
          <div className="max-w-5xl mx-auto flex">
            {TABS.map(tab => {
              const Icon = tab.icon;
              const isActive = pathname === tab.href;
              const badge = badges[tab.id] ?? 0;
              return (
                <Link key={tab.id} href={tab.href}
                  className={`flex items-center gap-2 px-5 py-3.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-all ${
                    isActive
                      ? "border-teal-600 text-teal-600"
                      : "border-transparent text-stone-400 hover:text-stone-600"
                  }`}>
                  <div className="relative">
                    <Icon className="w-4 h-4" />
                    {badge > 0 && (
                      <span className="absolute -top-2 -right-2 min-w-[16px] h-4 bg-red-500 rounded-full flex items-center justify-center px-1 text-white text-xs font-bold leading-none">
                        {badge > 9 ? "9+" : badge}
                      </span>
                    )}
                  </div>
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Share profile strip */}
      {user?.username && (
        <div className="bg-teal-50 border-b border-teal-100 flex-shrink-0">
          <div className="max-w-5xl mx-auto px-4 py-2.5 flex items-center gap-3">
            <Link2 className="w-4 h-4 text-teal-500 flex-shrink-0" />
            <p className="text-sm text-teal-700 font-medium truncate flex-1">
              studex.com.ng/vendor/{user.username}
            </p>
            <button
              onClick={() => {
                navigator.clipboard.writeText(`https://studex.com.ng/vendor/${user.username}`);
                setLinkCopied(true);
                setTimeout(() => setLinkCopied(false), 2000);
              }}
              className="flex items-center gap-1.5 text-xs font-semibold text-teal-700 bg-white border border-teal-200 px-3 py-1.5 rounded-full active:scale-95 transition-all flex-shrink-0">
              {linkCopied ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
              {linkCopied ? "Copied!" : "Copy"}
            </button>
            {typeof navigator !== "undefined" && "share" in navigator && (
              <button
                onClick={() => {
                  navigator.share({
                    title: `${user.username} on StudEx`,
                    text: "Check out my store on StudEx",
                    url: `https://studex.com.ng/vendor/${user.username}`,
                  }).catch(() => {});
                }}
                className="flex items-center gap-1.5 text-xs font-semibold text-white px-3 py-1.5 rounded-full active:scale-95 transition-all flex-shrink-0"
                style={{ background: GRAD }}>
                <Share2 className="w-3.5 h-3.5" />
                Share
              </button>
            )}
          </div>
        </div>
      )}

      {/* Page content */}
      <div className="max-w-5xl w-full mx-auto px-4 pt-4 pb-28">
        {children}
      </div>
    </div>
  );
}
