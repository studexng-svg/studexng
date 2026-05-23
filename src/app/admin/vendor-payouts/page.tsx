// src/app/admin/vendor-payouts/page.tsx
"use client";

import { Store, Search } from "lucide-react";
import { useEffect, useState } from "react";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { fetchWithAuth } from "@/lib/authStore";
import { CampusPills, type Campus } from "@/components/admin/CampusPills";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

interface VendorPayout {
  vendor_id: number;
  vendor: string;
  business_name: string;
  school: string;
  total_earned: number;
  order_count: number;
  last_date: string | null;
}

export default function AdminVendorPayoutsPage() {
  const [vendors, setVendors] = useState<VendorPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [campus, setCampus] = useState<Campus>("");

  const load = (s = search, c = campus) => {
    setLoading(true);
    let url = `${API_URL}/api/admin/vendor-payouts/?`;
    if (s) url += `search=${encodeURIComponent(s)}&`;
    if (c) url += `campus=${c}`;
    fetchWithAuth(url)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setVendors(Array.isArray(d) ? d : []))
      .catch(() => setVendors([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const totalPaid = vendors.reduce((sum, v) => sum + v.total_earned, 0);

  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <AdminTopBar title="Vendor Payouts" back="/admin" />

      <div className="px-4 pt-4 pb-28 max-w-2xl mx-auto space-y-3">

        {/* Summary */}
        {!loading && vendors.length > 0 && (
          <div className="bg-gradient-to-r from-teal-600 to-emerald-600 rounded-2xl p-4 text-white">
            <p className="text-teal-100 text-xs font-medium uppercase tracking-wider">Total Paid to Vendors</p>
            <p className="text-3xl font-bold mt-1">₦{totalPaid.toLocaleString()}</p>
            <p className="text-teal-200 text-xs mt-1">{vendors.length} vendor{vendors.length !== 1 ? "s" : ""} · {vendors.reduce((s, v) => s + v.order_count, 0)} orders</p>
          </div>
        )}

        <CampusPills value={campus} onChange={c => { setCampus(c); load(search, c); }} />

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            className="w-full bg-white border border-stone-200 rounded-xl pl-9 pr-4 py-2.5 text-sm placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-teal-400"
            placeholder="Search vendor or business name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === "Enter" && load(search, campus)}
          />
        </div>

        {!loading && (
          <p className="text-xs text-stone-400">{vendors.length} vendor{vendors.length !== 1 ? "s" : ""}</p>
        )}

        {loading ? (
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white border border-stone-200 rounded-2xl p-4 h-20 animate-pulse" />
            ))}
          </div>
        ) : vendors.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Store className="w-10 h-10 text-stone-300" />
            <p className="text-stone-400 text-sm">No vendor payout data</p>
          </div>
        ) : (
          <div className="space-y-2">
            {vendors.map((v, idx) => (
              <div key={v.vendor_id} className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0">
                      <span className="text-teal-700 font-bold text-sm">#{idx + 1}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-stone-900 text-sm">@{v.vendor}</p>
                      {v.business_name && (
                        <p className="text-stone-400 text-xs">{v.business_name}</p>
                      )}
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-stone-400">{v.order_count} order{v.order_count !== 1 ? "s" : ""}</span>
                        {v.school && (
                          <span className="text-xs bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded-full">{v.school}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-emerald-700 text-base">₦{v.total_earned.toLocaleString()}</p>
                    {v.last_date && (
                      <p className="text-xs text-stone-400 mt-0.5">
                        Last: {new Date(v.last_date).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                    )}
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
