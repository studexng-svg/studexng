// src/app/admin/analytics/page.tsx
"use client";

import { Users, Package, DollarSign, Store, FileText, TrendingUp } from "lucide-react";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { useEffect, useState } from "react";
import { fetchWithAuth } from "@/lib/authStore";
import { GRAD } from "@/lib/tokens";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

function Row({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-stone-100 last:border-0">
      <p className="text-stone-600 text-sm">{label}</p>
      <div className="text-right">
        <p className="font-bold text-stone-900 text-sm">{value}</p>
        {sub && <p className="text-stone-400 text-xs">{sub}</p>}
      </div>
    </div>
  );
}

export default function AdminAnalytics() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWithAuth(`${API_URL}/api/admin/dashboard/`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-[#FFF8F0]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <AdminTopBar title="Analytics" back="/admin" />

      <div className="px-4 pt-5 pb-28 max-w-2xl mx-auto space-y-4">

        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white border border-stone-200 rounded-2xl h-40 animate-pulse" />
            ))}
          </div>
        ) : !data ? (
          <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center">
            <p className="text-stone-400 text-sm">Could not load analytics.</p>
          </div>
        ) : (
          <>
            {/* Users */}
            <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: GRAD }}>
                  <Users className="w-3.5 h-3.5 text-white" />
                </div>
                <p className="text-teal-600 text-xs tracking-[0.2em] uppercase font-semibold">Users</p>
              </div>
              <Row label="Total users"       value={data.users.total_users} />
              <Row label="Active users"      value={data.users.active_users} sub={`${data.users.inactive_users} inactive`} />
              <Row label="New (last 30 days)" value={data.users.new_users_30d} />
              <Row label="Verified vendors"  value={data.users.verified_vendors} sub={`${data.users.pending_vendors} pending`} />
            </div>

            {/* Listings */}
            <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: GRAD }}>
                  <FileText className="w-3.5 h-3.5 text-white" />
                </div>
                <p className="text-teal-600 text-xs tracking-[0.2em] uppercase font-semibold">Listings</p>
              </div>
              <Row label="Total listings" value={data.listings.total_listings} />
              <Row label="Live / published" value={data.listings.published_listings} />
              <Row label="Pending approval" value={data.listings.draft_listings} />
              {data.listings.category_breakdown?.length > 0 && (
                <div className="mt-3 pt-3 border-t border-stone-100">
                  <p className="text-xs text-stone-500 font-medium mb-2">Top categories</p>
                  {data.listings.category_breakdown.map((cat: any) => (
                    <div key={cat.category__title} className="flex items-center justify-between py-1">
                      <p className="text-stone-600 text-sm">{cat.category__title || "Uncategorised"}</p>
                      <p className="font-semibold text-stone-900 text-sm">{cat.count}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Orders & Revenue */}
            <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: GRAD }}>
                  <DollarSign className="w-3.5 h-3.5 text-white" />
                </div>
                <p className="text-teal-600 text-xs tracking-[0.2em] uppercase font-semibold">Orders & Revenue</p>
              </div>
              <Row label="Total orders"    value={data.orders.total_orders} />
              <Row label="Pending"         value={data.orders.pending_orders} />
              <Row label="Completed"       value={data.orders.completed_orders} />
              <Row label="Cancelled"       value={data.orders.cancelled_orders} />
              <Row label="Revenue (30d)"   value={`₦${data.orders.revenue_30d.toLocaleString()}`} />
              <Row label="Total revenue"   value={`₦${data.orders.total_revenue.toLocaleString()}`} />
              <Row label="Avg order value" value={`₦${Math.round(data.orders.avg_order_value).toLocaleString()}`} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
