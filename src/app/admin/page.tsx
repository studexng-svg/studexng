// src/app/admin/page.tsx
"use client";

import {
  Users, Package, DollarSign, Store, FileText, Tag, TrendingUp,
  ChevronRight, AlertCircle, CheckCircle,
  CreditCard, Star, AlertTriangle, ArrowUpRight,
  ShoppingCart, MessageCircle, Send, Bot, RefreshCw, Percent,
} from "lucide-react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { api } from "@/lib/api";
import { GRAD, SERIF } from "@/lib/tokens";

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
  { label: "Bank Accounts",      href: "/admin/bank-accounts",    icon: CreditCard,   desc: "Vendor bank accounts & payout setup" },
  { label: "Reviews",             href: "/admin/reviews",          icon: Star,         desc: "Manage platform reviews" },
  { label: "Categories",          href: "/admin/categories",       icon: Tag,          desc: "Manage listing categories" },
  { label: "Deals",               href: "/admin/deals",            icon: Percent,      desc: "Manage product discounts and deals" },
  { label: "Payout Transactions", href: "/admin/transactions",     icon: ArrowUpRight, desc: "Escrow and release tracking" },
  { label: "Analytics",          href: "/admin/analytics",         icon: TrendingUp,   desc: "Charts, trends, live stats" },
  { label: "Cart Overview",      href: "/admin/cart",             icon: ShoppingCart, desc: "View all user cart items" },
  { label: "Conversations",      href: "/admin/conversations",    icon: MessageCircle,desc: "Monitor buyer/seller chats" },
  { label: "Messages",           href: "/admin/messages",         icon: Send,         desc: "Send notifications to users" },
  { label: "AI Assistant",      href: "/admin/ai",               icon: Bot,          desc: "Chat with AI, get reports & take actions" },
  { label: "Vendor of Month",  href: "/admin/vendor-of-month",  icon: TrendingUp,   desc: "See, pick or override the monthly winner" },
  { label: "Rewards",          href: "/admin/rewards",          icon: Star,         desc: "Loyalty credits and 5% discount usage" },
];

export default function AdminDashboard() {
  const queryClient = useQueryClient();

  const { data: stats, isPending: loading, isFetching: refreshing } = useQuery<DashStats>({
    queryKey: ["admin-dashboard"],
    queryFn: async () => {
      const r = await api.admin.dashboard();
      if (!r.ok) throw new Error("failed");
      return r.json();
    },
    refetchInterval: query =>
      document.visibilityState === "hidden" ? false : 60_000,
    staleTime: 30_000,
  });

  return (
    <div className="min-h-full" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <AdminTopBar title="Admin Dashboard" back="/home" />

      <div className="px-4 pt-5 pb-28 max-w-4xl space-y-5">

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
                <div className="flex items-center justify-between">
                  <p className="text-teal-600 text-xs tracking-[0.2em] uppercase font-semibold">Financials</p>
                  <button
                    onClick={() => queryClient.refetchQueries({ queryKey: ["admin-dashboard"] })}
                    disabled={refreshing}
                    className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-teal-600 transition-colors"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
                    {refreshing ? "Refreshing…" : "Refresh"}
                  </button>
                </div>
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

        {/* Quick links — mobile only (sidebar handles desktop) */}
        <div className="lg:hidden">
          <p className="text-teal-600 text-xs tracking-[0.2em] uppercase font-semibold mb-3">Quick Access</p>
          <div className="space-y-2">
            {QUICK_LINKS.map(({ label, href, icon: Icon, desc }) => (
              <Link key={href} href={href}>
                <div className="bg-white border border-stone-200 hover:border-teal-300 rounded-2xl p-4 flex items-center justify-between transition-all active:scale-[0.98]">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: GRAD }}>
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
