"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/authStore";
import { GRAD } from "@/lib/tokens";
import { api } from "@/lib/api";
import {
  MessageCircle, Calendar, DollarSign, Package, ShoppingBag,
  Star, LayoutDashboard, Link2, Share2, Check, History,
  MessageSquare, AlertCircle, ChevronRight, LogOut, Menu, X,
} from "lucide-react";

const TABS = [
  { id: "overview",  label: "Overview",  icon: LayoutDashboard, href: "/vendor/dashboard"           },
  { id: "messages",  label: "Messages",  icon: MessageCircle,   href: "/vendor/dashboard/messages"  },
  { id: "bookings",  label: "Bookings",  icon: Calendar,        href: "/vendor/dashboard/bookings"  },
  { id: "listings",  label: "Listings",  icon: Package,         href: "/vendor/dashboard/listings"  },
  { id: "orders",    label: "Orders",    icon: ShoppingBag,     href: "/vendor/dashboard/orders"    },
  { id: "disputes",  label: "Disputes",  icon: AlertCircle,     href: "/vendor/dashboard/disputes"  },
  { id: "history",   label: "History",   icon: History,         href: "/vendor/dashboard/history"   },
  { id: "earnings",  label: "Earnings",  icon: DollarSign,      href: "/vendor/dashboard/earnings"  },
  { id: "reviews",   label: "Reviews",   icon: Star,            href: "/vendor/dashboard/reviews"   },
  { id: "feedback",  label: "Feedback",  icon: MessageSquare,   href: "/vendor/dashboard/feedback"  },
];

export default function VendorDashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoggedIn, isHydrated } = useAuth();
  const router   = useRouter();
  const pathname = usePathname();

  const [linkCopied, setLinkCopied]   = useState(false);
  const [msgBadge, setMsgBadge]       = useState(0);
  const [bookingBadge, setBookingBadge] = useState(0);
  const [disputeBadge, setDisputeBadge] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
        setBookingBadge(list.filter((b: any) => b.vendor_username === user?.username && b.status === "pending").length);
      }).catch(() => {});
    api.orders.disputes()
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        const list = Array.isArray(d) ? d : (d.results || []);
        setDisputeBadge(list.filter((dp: any) => !dp.provider_response).length);
      }).catch(() => {});
  }, [user]);

  const badges: Record<string, number> = {
    messages: msgBadge,
    bookings: bookingBadge,
    disputes: disputeBadge,
  };

  const initials = (user?.username?.[0] || "V").toUpperCase();

  const NavItem = ({ tab }: { tab: typeof TABS[0] }) => {
    const Icon   = tab.icon;
    const active = pathname === tab.href || (tab.href !== "/vendor/dashboard" && pathname.startsWith(tab.href));
    const badge  = badges[tab.id] ?? 0;
    return (
      <Link
        href={tab.href}
        onClick={() => setSidebarOpen(false)}
        className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all group ${
          active
            ? "text-white shadow-sm"
            : "text-stone-500 hover:bg-stone-50 hover:text-stone-800"
        }`}
      style={active ? { background: GRAD } : {}}
      >
        <Icon className="w-4.5 h-4.5 flex-shrink-0" />
        <span className="flex-1">{tab.label}</span>
        {badge > 0 && (
          <span className="min-w-[20px] h-5 bg-red-500 rounded-full flex items-center justify-center px-1.5 text-white text-xs font-bold leading-none">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
        {!badge && active && <ChevronRight className="w-3.5 h-3.5 text-white/50" />}
      </Link>
    );
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Profile */}
      <div className="p-5 border-b border-stone-100">
        <div className="flex items-center gap-3">
          {user?.profile_image ? (
            <img src={user.profile_image} alt={user.username}
              className="w-11 h-11 rounded-2xl object-cover flex-shrink-0 shadow-sm" />
          ) : (
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center font-black text-white text-base flex-shrink-0 shadow-sm"
              style={{ background: GRAD }}>
              {initials}
            </div>
          )}
          <div className="min-w-0">
            <p className="font-black text-stone-900 text-sm truncate">@{user?.username}</p>
            <p className="text-xs text-stone-400">Vendor Hub</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto hide-scrollbar">
        {TABS.map(tab => <NavItem key={tab.id} tab={tab} />)}
      </nav>

      {/* Share profile */}
      {user?.username && (
        <div className="p-3 border-t border-stone-100 space-y-2">
          <p className="text-[10px] text-stone-400 uppercase font-bold tracking-widest px-1">Share profile</p>
          <div className="bg-stone-50 rounded-xl px-3 py-2 flex items-center gap-2">
            <Link2 className="w-3.5 h-3.5 text-teal-500 flex-shrink-0" />
            <p className="text-xs text-stone-500 font-medium truncate flex-1">studex.com.ng/vendor/{user.username}</p>
            <button
              onClick={() => {
                navigator.clipboard.writeText(`https://studex.com.ng/vendor/${user.username}`);
                setLinkCopied(true);
                setTimeout(() => setLinkCopied(false), 2000);
              }}
              className="text-xs font-bold text-teal-700 flex-shrink-0 hover:underline"
            >
              {linkCopied ? <Check className="w-3.5 h-3.5 text-teal-500" /> : "Copy"}
            </button>
          </div>
          {typeof navigator !== "undefined" && "share" in navigator && (
            <button
              onClick={() => {
                navigator.share({
                  title: `${user.username} on StudEx`,
                  text: "Check out my store on StudEx",
                  url: `https://studex.com.ng/vendor/${user.username}`,
                }).catch(() => {});
              }}
              className="w-full py-2 rounded-xl text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-opacity hover:opacity-90"
              style={{ background: GRAD }}
            >
              <Share2 className="w-3.5 h-3.5" /> Share Store
            </button>
          )}
        </div>
      )}

      {/* Sign out */}
      <div className="p-3 border-t border-stone-100">
        <button
          onClick={() => router.push("/home")}
          className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-semibold text-stone-400 hover:bg-stone-50 hover:text-stone-700 transition-all"
        >
          <LogOut className="w-4.5 h-4.5 flex-shrink-0" />
          Back to Store
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>

      {/* ── DESKTOP SIDEBAR ── */}
      <aside className="hidden lg:flex flex-col fixed left-0 top-0 bottom-0 w-64 bg-white border-r border-stone-100 shadow-sm z-30">
        <SidebarContent />
      </aside>

      {/* ── MOBILE SIDEBAR OVERLAY ── */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-[60] flex">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <aside className="relative w-72 bg-white shadow-2xl flex flex-col h-full">
            <button
              onClick={() => setSidebarOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center"
            >
              <X className="w-4 h-4 text-stone-500" />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* ── MOBILE HEADER ── */}
      <div className="lg:hidden sticky top-0 z-40">
        <div className="bg-white border-b border-stone-100 px-4 py-3.5 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="w-9 h-9 rounded-xl bg-stone-100 flex items-center justify-center"
            >
              <Menu className="w-4.5 h-4.5 text-stone-600" />
            </button>
            <div>
              <p className="text-[10px] text-stone-400 uppercase font-bold tracking-widest leading-none mb-0.5">Vendor Hub</p>
              <p className="font-black text-stone-900 text-sm leading-none">@{user?.username}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {msgBadge > 0 && (
              <Link href="/vendor/dashboard/messages">
                <div className="relative w-9 h-9 rounded-xl bg-stone-100 flex items-center justify-center">
                  <MessageCircle className="w-4.5 h-4.5 text-stone-600" />
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-white text-[9px] font-bold">
                    {msgBadge > 9 ? "9+" : msgBadge}
                  </span>
                </div>
              </Link>
            )}
            {user?.profile_image ? (
              <img src={user.profile_image} alt={user.username}
                className="w-9 h-9 rounded-xl object-cover" />
            ) : (
              <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-white text-sm"
                style={{ background: GRAD }}>
                {initials}
              </div>
            )}
          </div>
        </div>

        {/* Mobile scrollable tab bar */}
        <div className="bg-white border-b border-stone-100 overflow-x-auto [&::-webkit-scrollbar]:hidden">
          <div className="flex px-2">
            {TABS.map(tab => {
              const Icon   = tab.icon;
              const active = pathname === tab.href || (tab.href !== "/vendor/dashboard" && pathname.startsWith(tab.href));
              const badge  = badges[tab.id] ?? 0;
              return (
                <Link key={tab.id} href={tab.href}
                  className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap border-b-2 transition-all flex-shrink-0 ${
                    active ? "border-teal-600 text-teal-700" : "border-transparent text-stone-400 hover:text-stone-600"
                  }`}>
                  <div className="relative">
                    <Icon className="w-3.5 h-3.5" />
                    {badge > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-red-500 rounded-full flex items-center justify-center text-white text-[8px] font-bold">
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

      {/* ── MAIN CONTENT ── */}
      <main className="lg:ml-64 min-h-screen">
        <div className="max-w-5xl mx-auto px-4 lg:px-6 pt-6 pb-28">
          {children}
        </div>
      </main>
    </div>
  );
}
