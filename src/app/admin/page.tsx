// src/app/admin/page.tsx
"use client";

import {
  Users, Package, DollarSign, Store, FileText, Tag, TrendingUp,
  ChevronRight, AlertCircle, CheckCircle, Clock,
  CreditCard, Star, AlertTriangle, ArrowUpRight,
  ShoppingCart, MessageCircle, Send, Radio, Bot,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { fetchWithAuth } from "@/lib/authStore";
import { GRAD, SERIF } from "@/lib/tokens";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

interface ActivityData {
  online_count: number;
  online_vendors: number;
  online_students: number;
  online_users: { id: number; username: string; user_type: string; business_name?: string; last_seen: string }[];
}

interface DashStats {
  users: {
    total_users: number;
    active_users: number;
    vendors: number;
    verified_vendors: number;
    pending_vendors: number;
    new_users_30d: number;
  };
  listings: {
    total_listings: number;
    available_listings: number;
    pending_listings: number;
  };
  orders: {
    total_orders: number;
    pending_orders: number;
    completed_orders: number;
    disputed_orders: number;
    total_revenue: number;
    revenue_30d: number;
  };
  payments: {
    transaction_volume: number;
    vendor_payouts: number;
    platform_fees: number;
    transaction_volume_30d: number;
    vendor_payouts_30d: number;
    platform_fees_30d: number;
  };
}

function StatCard({ label, value, sub, icon: Icon, accent, href }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; accent: string; href?: string;
}) {
  const inner = (
    <div className={`bg-white border border-stone-200 rounded-2xl p-4 shadow-sm transition-all${href ? " hover:border-teal-300 hover:shadow-md active:scale-[0.98] cursor-pointer" : ""}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: accent + "20" }}>
          <Icon className="w-4.5 h-4.5" style={{ color: accent }} />
        </div>
        {sub && <span className="text-xs text-stone-400 font-medium">{sub}</span>}
      </div>
      <p className="text-2xl font-bold text-stone-900">{value}</p>
      <p className="text-xs text-stone-500 mt-0.5">{label}</p>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

const QUICK_LINKS = [
  { label: "Seller Approvals",    href: "/admin/seller-approvals", icon: FileText,     desc: "Review pending applications" },
  { label: "All Users",           href: "/admin/users",            icon: Users,        desc: "Manage registered users" },
  { label: "Vendors",             href: "/admin/sellers",          icon: Store,        desc: "View verified vendors" },
  { label: "Listings",            href: "/admin/listings",         icon: Package,      desc: "Approve & manage listings" },
  { label: "Orders",              href: "/admin/orders",           icon: Package,      desc: "Monitor all orders" },
  { label: "Disputes",            href: "/admin/disputes",         icon: AlertTriangle,desc: "Resolve buyer/seller disputes" },
  { label: "Payouts",             href: "/admin/payouts",          icon: DollarSign,   desc: "Payments, bank accounts, escrow" },
  { label: "Reviews",             href: "/admin/reviews",          icon: Star,         desc: "Manage platform reviews" },
  { label: "Categories",          href: "/admin/categories",       icon: Tag,          desc: "Manage listing categories" },
  { label: "Payout Transactions", href: "/admin/transactions",     icon: ArrowUpRight, desc: "Escrow and release tracking" },
  { label: "Analytics",          href: "/admin/analytics",         icon: TrendingUp,   desc: "Charts, trends, live stats" },
  { label: "Cart Overview",      href: "/admin/cart",             icon: ShoppingCart, desc: "View all user cart items" },
  { label: "Conversations",      href: "/admin/conversations",    icon: MessageCircle,desc: "Monitor buyer/seller chats" },
  { label: "Messages",           href: "/admin/messages",         icon: Send,         desc: "Send notifications to users" },
  { label: "AI Assistant",      href: "/admin/ai",               icon: Bot,          desc: "Chat with AI, get reports & take actions" },
];

function LiveActivity() {
  const [activity, setActivity] = useState<ActivityData | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const fetch_ = () => {
      fetchWithAuth(`${API_URL}/api/admin/activity/`)
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(d => setActivity(d))
        .catch(() => {});
    };
    fetch_();
    const id = setInterval(fetch_, 30_000);
    return () => clearInterval(id);
  }, []);

  const count = activity?.online_count ?? 0;

  return (
    <div className="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between p-4"
      >
        <div className="flex items-center gap-3">
          <div className="relative w-9 h-9 bg-teal-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <Radio className="w-4 h-4 text-teal-600" />
            {count > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center text-white text-[9px] font-bold leading-none">
                {count > 99 ? "99+" : count}
              </span>
            )}
          </div>
          <div className="text-left">
            <p className="font-semibold text-stone-900 text-sm">Live Activity</p>
            <p className="text-stone-400 text-xs">
              {activity
                ? `${count} online — ${activity.online_vendors}v / ${activity.online_students}s`
                : "Loading…"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {count > 0 && <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />}
          <ChevronRight className={`w-4 h-4 text-stone-400 transition-transform ${expanded ? "rotate-90" : ""}`} />
        </div>
      </button>

      {expanded && activity && (
        <div className="border-t border-stone-100 px-4 pb-4 pt-2 space-y-1">
          {activity.online_users.length === 0 ? (
            <p className="text-stone-400 text-xs text-center py-3">No one online right now</p>
          ) : (
            activity.online_users.map(u => (
              <div key={u.id} className="flex items-center gap-2 py-1.5">
                <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
                <span className="text-sm text-stone-800 font-medium truncate flex-1">
                  {u.business_name || u.username}
                </span>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0 ${
                  u.user_type === "vendor" ? "bg-teal-100 text-teal-700" : "bg-stone-100 text-stone-600"
                }`}>
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

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWithAuth(`${API_URL}/api/admin/dashboard/`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setStats(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-[#FFF8F0]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <AdminTopBar title="Admin Dashboard" back="/home" />

      <div className="px-4 pt-5 pb-28 max-w-2xl mx-auto space-y-5">

        {/* Header */}
        <div>
          <p className="text-teal-600 text-xs tracking-[0.2em] uppercase font-semibold">Overview</p>
          <h2 className="text-xl font-bold text-stone-900 mt-0.5" style={SERIF}>StudEx Platform</h2>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white border border-stone-200 rounded-2xl p-4 h-24 animate-pulse" />
            ))}
          </div>
        ) : stats ? (
          <>
            {/* Platform overview */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Total Users"      value={stats.users.total_users}       sub={`+${stats.users.new_users_30d} this month`}  icon={Users}     accent="#7C3AED" href="/admin/users" />
              <StatCard label="Verified Vendors" value={stats.users.verified_vendors}  sub={`${stats.users.pending_vendors} pending`}    icon={Store}     accent="#0D9488" href="/admin/sellers" />
              <StatCard label="Total Listings"   value={stats.listings.total_listings} sub={`${stats.listings.available_listings} live`} icon={FileText}  accent="#F59E0B" href="/admin/listings" />
              <StatCard label="Total Orders"     value={stats.orders.total_orders}     sub={`${stats.orders.pending_orders} pending`}    icon={Package}   accent="#EF4444" href="/admin/orders" />
            </div>

            {/* Financial breakdown */}
            {stats.payments && (
              <>
                <p className="text-teal-600 text-xs tracking-[0.2em] uppercase font-semibold">Financials</p>
                <div className="grid grid-cols-1 gap-3">
                  <StatCard
                    label="Transaction Volume"
                    value={`₦${stats.payments.transaction_volume.toLocaleString()}`}
                    sub={`₦${stats.payments.transaction_volume_30d.toLocaleString()} last 30 days`}
                    icon={ArrowUpRight}
                    accent="#6366F1"
                    href="/admin/payments"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <StatCard
                    label="Vendor Payouts"
                    value={`₦${stats.payments.vendor_payouts.toLocaleString()}`}
                    sub={`₦${stats.payments.vendor_payouts_30d.toLocaleString()} last 30d`}
                    icon={Store}
                    accent="#10B981"
                    href="/admin/vendor-payouts"
                  />
                  <StatCard
                    label="Platform Earnings"
                    value={`₦${stats.payments.platform_fees.toLocaleString()}`}
                    sub={`₦${stats.payments.platform_fees_30d.toLocaleString()} last 30d`}
                    icon={DollarSign}
                    accent="#F59E0B"
                    href="/admin/platform-earnings"
                  />
                </div>
              </>
            )}

            {/* Alerts */}
            {stats.users.pending_vendors > 0 && (
              <Link href="/admin/seller-approvals">
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center">
                      <AlertCircle className="w-4.5 h-4.5 text-amber-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-amber-900 text-sm">
                        {stats.users.pending_vendors} Pending Seller {stats.users.pending_vendors === 1 ? "Application" : "Applications"}
                      </p>
                      <p className="text-amber-600 text-xs">Tap to review and approve</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-amber-500" />
                </div>
              </Link>
            )}

            {stats.orders.pending_orders > 0 && (
              <Link href="/admin/orders">
                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center">
                      <Clock className="w-4.5 h-4.5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-blue-900 text-sm">
                        {stats.orders.pending_orders} Pending {stats.orders.pending_orders === 1 ? "Order" : "Orders"}
                      </p>
                      <p className="text-blue-600 text-xs">Awaiting confirmation</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-blue-500" />
                </div>
              </Link>
            )}

            {(stats.orders.disputed_orders ?? 0) > 0 && (
              <Link href="/admin/disputes">
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-red-100 rounded-xl flex items-center justify-center">
                      <AlertTriangle className="w-4.5 h-4.5 text-red-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-red-900 text-sm">
                        {stats.orders.disputed_orders} Open {stats.orders.disputed_orders === 1 ? "Dispute" : "Disputes"}
                      </p>
                      <p className="text-red-600 text-xs">Tap to review</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-red-400" />
                </div>
              </Link>
            )}

            {stats.orders.completed_orders > 0 && (
              <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4 flex items-center gap-3">
                <div className="w-9 h-9 bg-teal-100 rounded-xl flex items-center justify-center">
                  <CheckCircle className="w-4.5 h-4.5 text-teal-600" />
                </div>
                <div>
                  <p className="font-semibold text-teal-900 text-sm">{stats.orders.completed_orders} Completed Orders</p>
                  <p className="text-teal-600 text-xs">₦{stats.orders.total_revenue.toLocaleString()} total revenue</p>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center">
            <p className="text-stone-400 text-sm">Could not load dashboard stats.</p>
          </div>
        )}

        {/* Live activity */}
        <LiveActivity />

        {/* Quick links */}
        <div>
          <p className="text-teal-600 text-xs tracking-[0.2em] uppercase font-semibold mb-3">Quick Access</p>
          <div className="space-y-2">
            {QUICK_LINKS.map(({ label, href, icon: Icon, desc }) => (
              <Link key={href} href={href}>
                <div className="bg-white border border-stone-200 hover:border-teal-300 rounded-2xl p-4 flex items-center justify-between transition-all active:scale-[0.98]">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: GRAD }}>
                      <Icon className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <p className="font-semibold text-stone-900 text-sm">{label}</p>
                      <p className="text-stone-400 text-xs">{desc}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-stone-400" />
                </div>
              </Link>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
