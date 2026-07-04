// src/app/admin/analytics/page.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { RefreshCw, TrendingUp, Users, Package, DollarSign, FileText } from "lucide-react";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { api } from "@/lib/api";

const TEAL  = "#0D9488";
const PURPLE = "#7C3AED";
const AMBER  = "#F59E0B";
const RED    = "#EF4444";
const BLUE   = "#3B82F6";

const STATUS_COLORS: Record<string, string> = {
  pending:          AMBER,
  paid:             BLUE,
  seller_completed: PURPLE,
  completed:        TEAL,
  disputed:         RED,
  cancelled:        "#A8A29E",
};

function SectionCard({ title, icon: Icon, children }: {
  title: string; icon: React.ElementType; children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(124,58,237,0.12)" }}>
          <Icon className="w-3.5 h-3.5 text-purple-600" />
        </div>
        <p className="text-teal-600 text-xs tracking-[0.2em] uppercase font-semibold">{title}</p>
      </div>
      {children}
    </div>
  );
}

function StatRow({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-stone-100 last:border-0">
      <p className="text-stone-600 text-sm">{label}</p>
      <div className="text-right">
        <p className="font-bold text-stone-900 text-sm">{value}</p>
        {sub && <p className="text-stone-400 text-xs">{sub}</p>}
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-3 shadow-lg text-xs">
      <p className="font-semibold text-stone-700 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {p.name === "Revenue" ? `₦${Number(p.value).toLocaleString()}` : p.value}
        </p>
      ))}
    </div>
  );
};

export default function AdminAnalytics() {
  const [summary, setSummary]   = useState<any>(null);
  const [tsData, setTsData]     = useState<any>(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [days, setDays]         = useState(30);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async (d = days, silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [summaryRes, tsRes] = await Promise.all([
        api.admin.dashboard(),
        api.admin.analytics(d),
      ]);
      if (summaryRes.ok) setSummary(await summaryRes.json());
      if (tsRes.ok) setTsData(await tsRes.json());
      setLastUpdated(new Date());
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 60s
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState !== 'hidden') load(days, true); }, 60_000);
    return () => clearInterval(id);
  }, [days, load]);

  const pieData = tsData?.status_distribution
    ? Object.entries(tsData.status_distribution).map(([name, value]) => ({ name, value }))
    : [];

  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <AdminTopBar title="Analytics" back="/admin" />

      <div className="px-4 pt-4 pb-28 max-w-3xl mx-auto space-y-4">

        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            {[7, 14, 30, 60, 90].map(d => (
              <button key={d}
                onClick={() => { setDays(d); load(d); }}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${days === d ? "bg-teal-600 text-white" : "bg-white border border-stone-200 text-stone-600"}`}>
                {d}d
              </button>
            ))}
          </div>
          <button onClick={() => load(days, true)} disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-stone-200 rounded-full text-xs font-semibold text-stone-600 disabled:opacity-50 transition">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Updating…" : "Refresh"}
          </button>
        </div>

        {lastUpdated && (
          <p className="text-xs text-stone-400">Last updated: {lastUpdated.toLocaleTimeString("en-NG")}</p>
        )}

        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-white border border-stone-200 rounded-2xl h-48 animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {/* Summary stats */}
            {summary && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Total Users",     value: summary.users?.total_users ?? 0,       sub: `+${summary.users?.new_users_30d ?? 0} this month`, color: PURPLE },
                    { label: "Verified Vendors",value: summary.users?.verified_vendors ?? 0,  sub: `${summary.users?.pending_vendors ?? 0} pending`,   color: TEAL },
                    { label: "Total Listings",  value: summary.listings?.total_listings ?? 0, sub: `${summary.listings?.available_listings ?? 0} live`, color: AMBER },
                    { label: "Total Orders",    value: summary.orders?.total_orders ?? 0,     sub: `${summary.orders?.pending_orders ?? 0} pending`,   color: BLUE },
                  ].map(({ label, value, sub, color }) => (
                    <div key={label} className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
                      <p className="text-2xl font-bold" style={{ color }}>{value}</p>
                      <p className="text-stone-700 text-sm font-semibold mt-0.5">{label}</p>
                      <p className="text-stone-400 text-xs mt-0.5">{sub}</p>
                    </div>
                  ))}
                </div>

                {/* Financial breakdown */}
                {summary.payments && (
                  <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
                    <p className="text-teal-600 text-xs tracking-[0.2em] uppercase font-semibold mb-3">Financials (all-time)</p>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div>
                        <p className="text-lg font-bold text-stone-900">₦{Number(summary.payments.transaction_volume).toLocaleString()}</p>
                        <p className="text-stone-500 text-xs font-semibold mt-0.5">Transaction Volume</p>
                        <p className="text-stone-400 text-xs">what buyers paid</p>
                      </div>
                      <div className="border-x border-stone-100">
                        <p className="text-lg font-bold" style={{ color: "#10B981" }}>₦{Number(summary.payments.vendor_payouts).toLocaleString()}</p>
                        <p className="text-stone-500 text-xs font-semibold mt-0.5">Vendor Payouts</p>
                        <p className="text-stone-400 text-xs">sent to vendors</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold" style={{ color: AMBER }}>₦{Number(summary.payments.platform_fees).toLocaleString()}</p>
                        <p className="text-stone-500 text-xs font-semibold mt-0.5">Platform Earnings</p>
                        <p className="text-stone-400 text-xs">kept by StudEx</p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* New Users chart */}
            {tsData?.series && (
              <SectionCard title={`New Users — Last ${days} days`} icon={Users}>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={tsData.series} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F5F5F4" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#A8A29E" }} interval={Math.floor(days / 7)} />
                    <YAxis tick={{ fontSize: 10, fill: "#A8A29E" }} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="new_users" name="New Users" stroke={PURPLE} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </SectionCard>
            )}

            {/* Orders chart */}
            {tsData?.series && (
              <SectionCard title={`Orders — Last ${days} days`} icon={Package}>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={tsData.series} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F5F5F4" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#A8A29E" }} interval={Math.floor(days / 7)} />
                    <YAxis tick={{ fontSize: 10, fill: "#A8A29E" }} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="orders" name="Orders" fill={TEAL} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </SectionCard>
            )}

            {/* Transaction volume chart */}
            {tsData?.series && (
              <SectionCard title={`Transaction Volume — Last ${days} days`} icon={DollarSign}>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={tsData.series} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F5F5F4" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#A8A29E" }} interval={Math.floor(days / 7)} />
                    <YAxis tick={{ fontSize: 10, fill: "#A8A29E" }} tickFormatter={v => `₦${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="revenue" name="Volume" stroke={AMBER} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
                {summary?.payments && (
                  <div className="mt-3 pt-3 border-t border-stone-100 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-xs text-stone-400">Volume (30d)</p>
                      <p className="font-bold text-stone-900 text-sm">₦{Number(summary.payments.transaction_volume_30d ?? 0).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-stone-400">Vendor Paid (30d)</p>
                      <p className="font-bold text-stone-900 text-sm">₦{Number(summary.payments.vendor_payouts_30d ?? 0).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-stone-400">Earned (30d)</p>
                      <p className="font-bold text-stone-900 text-sm">₦{Number(summary.payments.platform_fees_30d ?? 0).toLocaleString()}</p>
                    </div>
                  </div>
                )}
              </SectionCard>
            )}

            {/* Order status distribution */}
            {pieData.length > 0 && (
              <SectionCard title="Order Status Distribution" icon={TrendingUp}>
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width="50%" height={180}>
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={75}>
                        {pieData.map((entry, i) => (
                          <Cell key={entry.name} fill={STATUS_COLORS[entry.name] || "#A8A29E"} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: any) => [v, ""]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-2">
                    {pieData.map(({ name, value }) => (
                      <div key={name} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: STATUS_COLORS[name] || "#A8A29E" }} />
                          <p className="text-stone-600 text-xs capitalize">{name.replace("_", " ")}</p>
                        </div>
                        <p className="font-bold text-stone-900 text-xs">{value as number}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </SectionCard>
            )}

            {/* Category breakdown */}
            {summary?.listings?.category_breakdown?.length > 0 && (
              <SectionCard title="Listings by Category" icon={FileText}>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart
                    data={summary.listings.category_breakdown.map((c: any) => ({
                      name: (c.category__title || "Other").slice(0, 12),
                      count: c.count,
                    }))}
                    layout="vertical"
                    margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#F5F5F4" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: "#A8A29E" }} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#A8A29E" }} width={72} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" name="Listings" fill={PURPLE} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </SectionCard>
            )}

            {/* Orders by category (last 30d) */}
            {summary?.category_orders?.length > 0 && (
              <SectionCard title="Orders by Category — Last 30 days" icon={TrendingUp}>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart
                    data={summary.category_orders.map((c: any) => ({
                      name: (c.category || "Other").slice(0, 12),
                      orders: c.orders,
                    }))}
                    layout="vertical"
                    margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#F5F5F4" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: "#A8A29E" }} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#A8A29E" }} width={80} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="orders" name="Orders" fill={TEAL} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </SectionCard>
            )}

            {/* Churning vendors */}
            {summary?.churning_vendors?.length > 0 && (
              <SectionCard title={`Churning Vendors — No orders in 14d (${summary.churning_vendors.length})`} icon={Users}>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {summary.churning_vendors.map((v: any) => (
                    <div key={v.id} className="flex items-center justify-between py-1.5 border-b border-stone-100 last:border-0">
                      <div>
                        <p className="text-sm font-semibold text-stone-800">{v.business_name || v.username}</p>
                        <p className="text-xs text-stone-400">@{v.username} · {(v.school || "").toUpperCase()}</p>
                      </div>
                      <a href={`/vendor/${v.username}`} target="_blank" rel="noreferrer"
                        className="text-xs text-teal-600 font-semibold hover:underline flex-shrink-0">
                        View →
                      </a>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}

            {/* Detailed stats table */}
            {summary && (
              <SectionCard title="Full Statistics" icon={TrendingUp}>
                <p className="text-teal-600 text-xs font-semibold mb-1 mt-1">Users</p>
                <StatRow label="Total users"       value={summary.users?.total_users ?? 0} />
                <StatRow label="Active users"      value={summary.users?.active_users ?? 0} sub={`${summary.users?.inactive_users ?? 0} inactive`} />
                <StatRow label="New (last 30d)"    value={summary.users?.new_users_30d ?? 0} />
                <StatRow label="Verified vendors"  value={summary.users?.verified_vendors ?? 0} sub={`${summary.users?.pending_vendors ?? 0} pending`} />
                <p className="text-teal-600 text-xs font-semibold mb-1 mt-4">Listings</p>
                <StatRow label="Total listings"    value={summary.listings?.total_listings ?? 0} />
                <StatRow label="Available / Live"  value={summary.listings?.available_listings ?? 0} />
                <StatRow label="Pending approval"  value={summary.listings?.pending_listings ?? 0} />
                <p className="text-teal-600 text-xs font-semibold mb-1 mt-4">Orders</p>
                <StatRow label="Total orders"      value={summary.orders?.total_orders ?? 0} />
                <StatRow label="Pending"           value={summary.orders?.pending_orders ?? 0} />
                <StatRow label="Completed"         value={summary.orders?.completed_orders ?? 0} />
                <StatRow label="Disputed"          value={summary.orders?.disputed_orders ?? 0} />
                <StatRow label="Cancelled"         value={summary.orders?.cancelled_orders ?? 0} />
                <StatRow label="Avg order value"   value={`₦${Math.round(summary.orders?.avg_order_value ?? 0).toLocaleString()}`} />
                <p className="text-teal-600 text-xs font-semibold mb-1 mt-4">Financials</p>
                <StatRow label="Transaction Volume"  value={`₦${Number(summary.payments?.transaction_volume ?? 0).toLocaleString()}`}  sub={`₦${Number(summary.payments?.transaction_volume_30d ?? 0).toLocaleString()} last 30d`} />
                <StatRow label="Vendor Payouts"      value={`₦${Number(summary.payments?.vendor_payouts ?? 0).toLocaleString()}`}      sub={`₦${Number(summary.payments?.vendor_payouts_30d ?? 0).toLocaleString()} last 30d`} />
                <StatRow label="Platform Earnings"   value={`₦${Number(summary.payments?.platform_fees ?? 0).toLocaleString()}`}      sub={`₦${Number(summary.payments?.platform_fees_30d ?? 0).toLocaleString()} last 30d`} />
              </SectionCard>
            )}
          </>
        )}
      </div>
    </div>
  );
}
