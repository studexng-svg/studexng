// src/app/admin/cart/page.tsx
"use client";

import { ShoppingCart, Search, Package } from "lucide-react";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { useState, useEffect, useCallback } from "react";
import { fetchAllPages } from "@/lib/authStore";
import { CampusPills, type Campus } from "@/components/admin/CampusPills";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export default function AdminCartPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [campus, setCampus] = useState<Campus>("");

  const load = useCallback((s = search, c = campus) => {
    setLoading(true);
    let url = `${API_URL}/api/admin/cart/?`;
    if (s) url += `search=${encodeURIComponent(s)}&`;
    if (c) url += `campus=${c}`;
    fetchAllPages(url)
      .then(d => setItems(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const totalValue = items.reduce((acc, i) => acc + parseFloat(i.listing_price) * i.quantity, 0);
  const uniqueUsers = new Set(items.map(i => i.user_id)).size;

  return (
    <div className="min-h-screen bg-[#FAF9F6]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <AdminTopBar title="Cart Overview" back="/admin" />

      <div className="px-4 pt-4 pb-28 max-w-2xl mx-auto space-y-4">

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Items",       value: loading ? "—" : items.length },
            { label: "Users",       value: loading ? "—" : uniqueUsers },
            { label: "Total Value", value: loading ? "—" : `₦${totalValue.toLocaleString()}` },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white border border-stone-200 rounded-2xl p-3 text-center shadow-sm">
              <p className="text-lg font-bold text-stone-900 truncate">{value}</p>
              <p className="text-xs text-stone-400">{label}</p>
            </div>
          ))}
        </div>

        {/* Campus filter */}
        <CampusPills value={campus} onChange={c => { setCampus(c); load(search, c); }} />

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === "Enter" && load(search, campus)}
            placeholder="Search username or listing…"
            className="w-full pl-10 pr-4 py-3 bg-white border border-stone-200 rounded-xl text-stone-900 placeholder:text-stone-400 text-sm focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20"
          />
        </div>

        {loading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-white border border-stone-200 rounded-2xl h-16 animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="bg-white border border-stone-100 rounded-2xl p-14 text-center">
            <ShoppingCart className="w-10 h-10 text-stone-200 mx-auto mb-3" />
            <p className="text-stone-400 text-sm">No cart items found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map(item => (
              <div key={item.id} className="bg-white border border-stone-200 rounded-2xl p-3.5 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0">
                    <Package className="w-4 h-4 text-teal-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-stone-900 text-sm truncate">{item.listing_title}</p>
                    <p className="text-stone-400 text-xs">
                      by <span className="text-stone-600 font-medium">{item.username}</span>
                      {" · "}qty {item.quantity}
                      {" · "}₦{(parseFloat(item.listing_price) * item.quantity).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                      item.listing_campus === "futo"
                        ? "bg-orange-100 text-orange-700"
                        : "bg-teal-50 text-teal-700"
                    }`}>
                      {item.listing_campus?.toUpperCase() || "PAU"}
                    </span>
                    {item.reserved_at && (
                      <span className="text-xs text-amber-600 font-medium">Reserved</span>
                    )}
                  </div>
                </div>
                <p className="text-stone-300 text-xs mt-2 pl-12">
                  Added {new Date(item.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
