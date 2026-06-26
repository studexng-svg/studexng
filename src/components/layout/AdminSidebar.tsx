"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Users, Package, DollarSign, Store, FileText, Tag, TrendingUp,
  CreditCard, Star, AlertTriangle, ArrowUpRight, LayoutDashboard,
  ShoppingCart, MessageCircle, Send, Radio, Bot, Percent,
  ChevronDown, ChevronRight, Home,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { GRAD } from "@/lib/tokens";

const NAV: {
  group: string;
  items: { label: string; href: string; icon: React.ElementType; badge?: number }[];
}[] = [
  {
    group: "People",
    items: [
      { label: "Seller Approvals", href: "/admin/seller-approvals", icon: FileText },
      { label: "All Users",        href: "/admin/users",            icon: Users },
      { label: "Vendors",          href: "/admin/sellers",          icon: Store },
    ],
  },
  {
    group: "Marketplace",
    items: [
      { label: "Listings",   href: "/admin/listings",   icon: Package },
      { label: "Categories", href: "/admin/categories", icon: Tag },
      { label: "Deals",      href: "/admin/deals",      icon: Percent },
      { label: "Reviews",    href: "/admin/reviews",    icon: Star },
    ],
  },
  {
    group: "Commerce",
    items: [
      { label: "Orders",              href: "/admin/orders",        icon: ShoppingCart },
      { label: "Disputes",            href: "/admin/disputes",      icon: AlertTriangle },
      { label: "Payouts",             href: "/admin/payouts",       icon: DollarSign },
      { label: "Bank Accounts",       href: "/admin/bank-accounts", icon: CreditCard },
      { label: "Payout Transactions", href: "/admin/transactions",  icon: ArrowUpRight },
    ],
  },
  {
    group: "Platform",
    items: [
      { label: "Analytics",      href: "/admin/analytics",      icon: TrendingUp },
      { label: "Cart Overview",  href: "/admin/cart",           icon: ShoppingCart },
      { label: "Conversations",  href: "/admin/conversations",  icon: MessageCircle },
      { label: "Messages",       href: "/admin/messages",       icon: Send },
      { label: "AI Assistant",   href: "/admin/ai",             icon: Bot },
      { label: "Vendor of Month",href: "/admin/vendor-of-month",icon: TrendingUp },
      { label: "Rewards",        href: "/admin/rewards",        icon: Star },
    ],
  },
];

function NavItem({ href, icon: Icon, label }: { href: string; icon: React.ElementType; label: string }) {
  const pathname = usePathname();
  const active = pathname === href || (href !== "/admin" && pathname.startsWith(href));
  return (
    <Link href={href}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
        active
          ? "bg-white/10 text-white"
          : "text-stone-400 hover:text-white hover:bg-white/5"
      }`}>
      <Icon className={`w-4 h-4 flex-shrink-0 ${active ? "text-teal-400" : ""}`} />
      <span className="truncate">{label}</span>
      {active && <span className="ml-auto w-1 h-1 rounded-full bg-teal-400" />}
    </Link>
  );
}

function LiveActivity() {
  const [open, setOpen] = useState(false);
  const { data } = useQuery<{
    online_count: number;
    online_vendors: number;
    online_students: number;
    online_users: { id: number; username: string; user_type: string; business_name?: string }[];
  }>({
    queryKey: ["admin-activity-sidebar"],
    queryFn: async () => {
      const r = await api.admin.activity();
      if (!r.ok) throw new Error();
      return r.json();
    },
    refetchInterval: () => document.visibilityState === "hidden" ? false : 60_000,
    staleTime: 30_000,
  });

  const count = data?.online_count ?? 0;

  return (
    <div className="border-t border-white/10 pt-3 mt-3">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-stone-400 hover:text-white hover:bg-white/5 transition-all">
        <div className="relative">
          <Radio className="w-4 h-4 flex-shrink-0" />
          {count > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-green-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center leading-none">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </div>
        <span className="flex-1 truncate">Live Activity</span>
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      </button>

      {open && data && (
        <div className="mt-1 px-3 space-y-1">
          {data.online_users.length === 0 ? (
            <p className="text-stone-500 text-xs py-2 text-center">No one online</p>
          ) : (
            data.online_users.slice(0, 8).map(u => (
              <div key={u.id} className="flex items-center gap-2 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
                <span className="text-xs text-stone-400 truncate flex-1">{u.business_name || u.username}</span>
                <span className={`text-[10px] font-bold px-1 rounded ${u.user_type === "vendor" ? "text-teal-400" : "text-stone-500"}`}>
                  {u.user_type === "vendor" ? "V" : "S"}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const isDashboard = pathname === "/admin";

  return (
    <aside className="hidden lg:flex flex-col w-56 flex-shrink-0 bg-zinc-950 border-r border-white/5 h-screen overflow-hidden">
      {/* Brand header */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-white/10 flex-shrink-0">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: GRAD }}>
          <span className="text-white font-black text-xs">SX</span>
        </div>
        <div>
          <p className="text-white font-bold text-sm leading-none">StudEx</p>
          <p className="text-stone-500 text-[10px] mt-0.5">Admin Panel</p>
        </div>
        <button onClick={() => router.push("/home")}
          className="ml-auto p-1.5 rounded-md text-stone-500 hover:text-white hover:bg-white/10 transition"
          title="Back to app">
          <Home className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Dashboard link */}
      <div className="px-3 pt-3 pb-1 flex-shrink-0">
        <Link href="/admin"
          className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
            isDashboard ? "bg-white/10 text-white" : "text-stone-400 hover:text-white hover:bg-white/5"
          }`}>
          <LayoutDashboard className={`w-4 h-4 flex-shrink-0 ${isDashboard ? "text-teal-400" : ""}`} />
          Dashboard
          {isDashboard && <span className="ml-auto w-1 h-1 rounded-full bg-teal-400" />}
        </Link>
      </div>

      {/* Nav groups — scrollable */}
      <nav className="flex-1 overflow-y-auto px-3 py-1 space-y-4 scrollbar-thin">
        {NAV.map(({ group, items }) => (
          <div key={group}>
            <p className="text-[10px] font-bold tracking-widest uppercase text-stone-600 px-3 mb-1">{group}</p>
            <div className="space-y-0.5">
              {items.map(item => <NavItem key={item.href} {...item} />)}
            </div>
          </div>
        ))}

        <LiveActivity />
      </nav>
    </aside>
  );
}
