"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/authStore";
import { api } from "@/lib/api";
import { TEAL } from "@/lib/tokens";
import {
  DollarSign, ShoppingBag, Package, Star,
  TrendingUp, Clock, CheckCircle2, ArrowRight,
  AlertCircle, Calendar,
} from "lucide-react";
import {
  BarChart, Bar, ResponsiveContainer, Tooltip, XAxis,
} from "recharts";

function StatCard({
  label, value, sub, icon: Icon, color, bg,
}: {
  label: string; value: string | number; sub?: string;
  icon: any; color: string; bg: string;
}) {
  return (
    <div className={`${bg} rounded-2xl p-5 border flex items-start gap-4 shadow-sm`}>
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-stone-400 font-medium leading-none mb-1">{label}</p>
        <p className="text-2xl font-black text-stone-900 leading-tight">{value}</p>
        {sub && <p className="text-xs text-stone-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  pending:          "bg-amber-100 text-amber-700",
  confirmed:        "bg-teal-50 text-teal-700",
  completed:        "bg-emerald-50 text-emerald-700",
  cancelled:        "bg-red-50 text-red-500",
  seller_completed: "bg-purple-50 text-purple-700",
  disputed:         "bg-red-50 text-red-500",
  paid:             "bg-blue-50 text-blue-700",
};

export default function VendorOverviewPage() {
  const { user } = useAuth();

  const [earnings, setEarnings]   = useState<any>(null);
  const [orders, setOrders]       = useState<any[]>([]);
  const [listings, setListings]   = useState<any[]>([]);
  const [txns, setTxns]           = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api.payments.earnings()
        .then(r => r.ok ? r.json() : null)
        .catch(() => null),
      api.orders.list("seller")
        .then(r => r.ok ? r.json() : [])
        .then(d => Array.isArray(d) ? d : (d.results || []))
        .catch(() => []),
      api.services.listingsAuth({ vendor_username: user.username, page_size: "100" })
        .then(r => r.ok ? r.json() : [])
        .then(d => Array.isArray(d) ? d : (d.results || []))
        .catch(() => []),
      api.payments.transactions()
        .then(r => r.ok ? r.json() : [])
        .then(d => Array.isArray(d) ? d : (d.results || []))
        .catch(() => []),
    ]).then(([earn, ord, lst, tx]) => {
      setEarnings(earn);
      setOrders(ord);
      setListings(lst);
      setTxns(tx);
    }).finally(() => setLoading(false));
  }, [user]);

  const totalEarned  = Number(earnings?.total_earned  || 0);
  const totalOrders  = Number(earnings?.total_orders  || 0);
  const pendingOrders = orders.filter(o => o.status === "pending" || o.status === "confirmed").length;
  const activeListings = listings.filter(l => l.is_available).length;
  const avgRating    = user?.profile?.rating ? Number(user.profile.rating).toFixed(1) : "—";
  const recentOrders = [...orders]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 6);

  // Build weekly bar chart data from transactions (last 7 days)
  const chartData = (() => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const buckets: Record<number, number> = {};
    const now = Date.now();
    txns.forEach((tx: any) => {
      const d = new Date(tx.created_at);
      const daysAgo = Math.floor((now - d.getTime()) / 86400000);
      if (daysAgo < 7) {
        const dow = d.getDay();
        buckets[dow] = (buckets[dow] || 0) + Number(tx.seller_amount || 0);
      }
    });
    return days.map((name, i) => ({ name, amount: buckets[i] || 0 }));
  })();

  const greeting = user?.username
    ? `Hello, ${user.username}!`
    : "Your Dashboard";

  return (
    <div className="space-y-6">

      {/* ── GREETING ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-stone-900" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{greeting}</h1>
          <p className="text-stone-400 text-sm mt-0.5">Here's what's happening in your store.</p>
        </div>
        {user?.profile?.vendor_badge && user.profile.vendor_badge !== "none" && (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
            {user.profile.vendor_badge === "top" ? "🏆 Top Vendor" : user.profile.vendor_badge === "trusted" ? "✅ Trusted" : "⭐ Rising"}
          </span>
        )}
      </div>

      {/* ── STAT CARDS ── */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white rounded-2xl p-5 border border-stone-100 shadow-sm animate-pulse">
              <div className="w-11 h-11 rounded-xl bg-stone-200 mb-3" />
              <div className="h-3 bg-stone-200 rounded w-3/4 mb-2" />
              <div className="h-6 bg-stone-200 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Total Earned"
            value={`₦${totalEarned >= 1000 ? (totalEarned / 1000).toFixed(1) + "k" : totalEarned.toLocaleString()}`}
            sub="All time"
            icon={DollarSign}
            color="bg-teal-100 text-teal-700"
            bg="bg-white border-teal-100"
          />
          <StatCard
            label="Total Orders"
            value={totalOrders}
            sub="Completed"
            icon={ShoppingBag}
            color="bg-purple-100 text-purple-700"
            bg="bg-white border-purple-100"
          />
          <StatCard
            label="Active Listings"
            value={activeListings}
            sub={`${listings.length} total`}
            icon={Package}
            color="bg-blue-100 text-blue-700"
            bg="bg-white border-blue-100"
          />
          <StatCard
            label="Rating"
            value={avgRating}
            sub={`${user?.profile?.total_reviews || 0} reviews`}
            icon={Star}
            color="bg-amber-100 text-amber-700"
            bg="bg-white border-amber-100"
          />
        </div>
      )}

      {/* ── BOTTOM ROW: Chart + Recent Orders ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5">

        {/* Weekly earnings bar chart */}
        <div className="bg-white rounded-2xl p-5 border border-stone-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs text-stone-400 uppercase font-bold tracking-wider">This Week</p>
              <h3 className="font-black text-stone-900 text-base mt-0.5">Earnings Overview</h3>
            </div>
            <div className="flex items-center gap-1.5 text-teal-600 text-xs font-semibold">
              <TrendingUp className="w-4 h-4" />
              7-day
            </div>
          </div>
          {txns.length === 0 && !loading ? (
            <div className="h-32 flex items-center justify-center text-stone-300 text-sm">
              No transactions yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={chartData} barSize={24}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#a8a29e" }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(v: number) => [`₦${v.toLocaleString()}`, "Earned"]}
                  contentStyle={{ borderRadius: 12, border: "1px solid #e7e5e4", fontSize: 12 }}
                  cursor={{ fill: "rgba(13,148,136,0.06)" }}
                />
                <Bar dataKey="amount" fill="#0d9488" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}

          {/* Pending + disputes quick stats */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Link href="/vendor/dashboard/orders">
              <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 flex items-center gap-2.5 hover:border-amber-300 transition-colors">
                <Clock className="w-4.5 h-4.5 text-amber-500 flex-shrink-0" />
                <div>
                  <p className="text-xs text-amber-600 font-medium">Pending</p>
                  <p className="font-black text-stone-900 text-base leading-tight">{pendingOrders}</p>
                </div>
              </div>
            </Link>
            <Link href="/vendor/dashboard/listings">
              <div className="bg-teal-50 border border-teal-100 rounded-xl px-4 py-3 flex items-center gap-2.5 hover:border-teal-300 transition-colors">
                <CheckCircle2 className="w-4.5 h-4.5 text-teal-500 flex-shrink-0" />
                <div>
                  <p className="text-xs text-teal-600 font-medium">Live</p>
                  <p className="font-black text-stone-900 text-base leading-tight">{activeListings}</p>
                </div>
              </div>
            </Link>
          </div>
        </div>

        {/* Recent orders */}
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
            <h3 className="font-black text-stone-900 text-base">Recent Orders</h3>
            <Link href="/vendor/dashboard/orders" className="text-teal-600 text-xs font-semibold flex items-center gap-0.5 hover:underline">
              View all <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {loading ? (
            <div className="divide-y divide-stone-50">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="px-5 py-4 flex items-center gap-3 animate-pulse">
                  <div className="w-9 h-9 rounded-full bg-stone-200 flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-stone-200 rounded w-2/3" />
                    <div className="h-2.5 bg-stone-100 rounded w-1/2" />
                  </div>
                  <div className="h-3 bg-stone-200 rounded w-12" />
                </div>
              ))}
            </div>
          ) : recentOrders.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <ShoppingBag className="w-10 h-10 text-stone-200 mx-auto mb-2" />
              <p className="text-stone-400 text-sm">No orders yet</p>
            </div>
          ) : (
            <div className="divide-y divide-stone-50">
              {recentOrders.map((order: any) => {
                const statusStyle = STATUS_STYLES[order.status] || "bg-stone-100 text-stone-500";
                const isService   = order.listing_type === "service" || order.booking_id;
                const initials    = (order.buyer_username?.[0] || order.customer_name?.[0] || "?").toUpperCase();
                return (
                  <Link
                    key={order.id}
                    href={isService ? "/vendor/dashboard/bookings" : "/vendor/dashboard/orders"}
                    className="px-5 py-4 flex items-center gap-3 hover:bg-stone-50 transition-colors group"
                  >
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-black flex-shrink-0 shadow-sm"
                      style={{ background: TEAL }}>
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-stone-900 text-sm truncate">
                        {order.listing_title || order.service_name || `Order #${order.id}`}
                      </p>
                      <p className="text-xs text-stone-400 truncate mt-0.5">
                        @{order.buyer_username || order.customer_name}
                        {isService ? <span className="ml-1 text-teal-500">· Booking</span> : null}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-bold text-stone-900 text-sm">
                        ₦{Number(order.total_price || order.price || 0).toLocaleString()}
                      </p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold capitalize ${statusStyle}`}>
                        {(order.status || "").replace("_", " ")}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── QUICK LINKS ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: "Bookings",  href: "/vendor/dashboard/bookings",  icon: Calendar,      color: "text-teal-600",   bg: "bg-teal-50"   },
          { label: "Disputes",  href: "/vendor/dashboard/disputes",  icon: AlertCircle,   color: "text-red-500",    bg: "bg-red-50"    },
          { label: "Earnings",  href: "/vendor/dashboard/earnings",  icon: DollarSign,    color: "text-emerald-600",bg: "bg-emerald-50"},
          { label: "Reviews",   href: "/vendor/dashboard/reviews",   icon: Star,          color: "text-amber-600",  bg: "bg-amber-50"  },
          { label: "History",   href: "/vendor/dashboard/history",   icon: TrendingUp,    color: "text-purple-600", bg: "bg-purple-50" },
        ].map(item => (
          <Link key={item.href} href={item.href}>
            <div className={`${item.bg} rounded-2xl p-4 flex flex-col items-center gap-2 border border-transparent hover:border-stone-200 hover:shadow-sm transition-all text-center`}>
              <item.icon className={`w-5 h-5 ${item.color}`} />
              <p className="text-xs font-semibold text-stone-700">{item.label}</p>
            </div>
          </Link>
        ))}
      </div>

    </div>
  );
}
