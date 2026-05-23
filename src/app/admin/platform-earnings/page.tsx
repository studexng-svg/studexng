// src/app/admin/platform-earnings/page.tsx
"use client";

import { DollarSign, Search, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { fetchWithAuth } from "@/lib/authStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

interface EarningTotals {
  total_platform_fees: number;
  total_platform_fees_30d: number;
  total_volume: number;
  transaction_count: number;
}

interface EarningRow {
  id: number;
  reference: string;
  buyer: string | null;
  seller: string | null;
  total_paid: number;
  seller_amount: number;
  platform_fee: number;
  service_charge?: number;
  discount?: number;
  date: string;
}

interface EarningsData {
  totals: EarningTotals;
  transactions: EarningRow[];
}

export default function AdminPlatformEarningsPage() {
  const [data, setData] = useState<EarningsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = (s = search) => {
    setLoading(true);
    let url = `${API_URL}/api/admin/platform-earnings/?`;
    if (s) url += `search=${encodeURIComponent(s)}`;
    fetchWithAuth(url)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const totals = data?.totals;
  const transactions = data?.transactions ?? [];

  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <AdminTopBar title="Platform Earnings" back="/admin" />

      <div className="px-4 pt-4 pb-28 max-w-2xl mx-auto space-y-3">

        {/* Summary cards */}
        {!loading && totals && (
          <>
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-2xl p-4 text-white">
              <p className="text-amber-100 text-xs font-medium uppercase tracking-wider">Total Platform Earnings</p>
              <p className="text-3xl font-bold mt-1">₦{totals.total_platform_fees.toLocaleString()}</p>
              <p className="text-amber-200 text-xs mt-1">{totals.transaction_count} transaction{totals.transaction_count !== 1 ? "s" : ""}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
                <p className="text-stone-400 text-xs uppercase tracking-wide">Last 30 Days</p>
                <p className="text-xl font-bold text-amber-600 mt-1">₦{totals.total_platform_fees_30d.toLocaleString()}</p>
                <p className="text-stone-400 text-xs mt-0.5">platform fees</p>
              </div>
              <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
                <p className="text-stone-400 text-xs uppercase tracking-wide">Transaction Volume</p>
                <p className="text-xl font-bold text-indigo-600 mt-1">₦{totals.total_volume.toLocaleString()}</p>
                <p className="text-stone-400 text-xs mt-0.5">total buyer payments</p>
              </div>
            </div>
          </>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            className="w-full bg-white border border-stone-200 rounded-xl pl-9 pr-4 py-2.5 text-sm placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-teal-400"
            placeholder="Search reference, buyer, seller…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === "Enter" && load(search)}
          />
        </div>

        {!loading && (
          <p className="text-xs text-stone-400">{transactions.length} transaction{transactions.length !== 1 ? "s" : ""}</p>
        )}

        {loading ? (
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white border border-stone-200 rounded-2xl p-4 h-24 animate-pulse" />
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <TrendingUp className="w-10 h-10 text-stone-300" />
            <p className="text-stone-400 text-sm">No earnings data</p>
          </div>
        ) : (
          <div className="space-y-2">
            {transactions.map(t => (
              <div key={t.id} className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-stone-900 text-sm font-mono truncate">{t.reference}</p>
                    <p className="text-stone-500 text-xs mt-0.5">
                      @{t.buyer ?? "—"} → @{t.seller ?? "—"}
                    </p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-stone-400 text-xs">Paid: ₦{t.total_paid.toLocaleString()}</span>
                      <span className="text-stone-300 text-xs">·</span>
                      <span className="text-stone-400 text-xs">Vendor: ₦{t.seller_amount.toLocaleString()}</span>
                    </div>
                    {t.discount !== undefined && t.discount > 0 && (
                      <p className="text-purple-500 text-xs mt-0.5">Discount applied: ₦{t.discount.toLocaleString()}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-amber-600 text-base">+₦{t.platform_fee.toLocaleString()}</p>
                    <p className="text-xs text-stone-400 mt-0.5">
                      {new Date(t.date).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
