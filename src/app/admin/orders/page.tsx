// src/app/admin/orders/page.tsx
"use client";

import { Package, Search, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { useState, useEffect, useRef } from "react";
import { fetchAllPages } from "@/lib/authStore";
import { GRAD } from "@/lib/tokens";
import { CampusPills, type Campus } from "@/components/admin/CampusPills";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const STATUS_LABELS: Record<string, string> = {
  pending:          "Pending",
  paid:             "In Progress",
  seller_completed: "Awaiting Confirmation",
  confirmed:        "Confirmed",
  completed:        "Completed",
  cancelled:        "Cancelled",
  disputed:         "Disputed",
};
const STATUS_STYLE: Record<string, string> = {
  pending:          "bg-amber-100 text-amber-700",
  paid:             "bg-amber-100 text-amber-700",
  seller_completed: "bg-blue-100 text-blue-700",
  confirmed:        "bg-blue-100 text-blue-700",
  completed:        "bg-teal-100 text-teal-700",
  cancelled:        "bg-stone-100 text-stone-500",
  disputed:         "bg-red-100 text-red-700",
};
const STATUS_TABS = ["", "paid", "seller_completed", "completed", "disputed", "cancelled"];

export default function AdminOrders() {
  const router = useRouter();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [campus, setCampus] = useState<Campus>("");
  const filtersRef = useRef({ statusFilter: "", campus: "" as Campus });

  const load = (s?: string, st?: string, c?: Campus, silent = false) => {
    if (!silent) setLoading(true);
    let url = `${API_URL}/api/admin/orders/?`;
    if (st) url += `status=${st}&`;
    if (c) url += `campus=${c}&`;
    fetchAllPages(url)
      .then(d => setOrders(d))
      .catch(() => {})
      .finally(() => { if (!silent) setLoading(false); });
  };

  useEffect(() => {
    load();
    const interval = setInterval(() => {
      const f = filtersRef.current;
      load(undefined, f.statusFilter || undefined, f.campus || undefined, true);
    }, 15000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  filtersRef.current = { statusFilter, campus };

  const handleCampus = (c: Campus) => { setCampus(c); load(undefined, statusFilter, c); };
  const handleStatus = (st: string) => { setStatusFilter(st); load(undefined, st, campus); };

  const filtered = search.trim()
    ? orders.filter(o => {
        const q = search.toLowerCase();
        return String(o.id).includes(q) ||
          o.buyer?.username?.toLowerCase().includes(q) ||
          o.listing?.title?.toLowerCase().includes(q);
      })
    : orders;

  const counts: Record<string, number> = {
    "": orders.length,
    paid: orders.filter(o => o.status === "paid").length,
    seller_completed: orders.filter(o => o.status === "seller_completed").length,
    completed: orders.filter(o => o.status === "completed").length,
    disputed: orders.filter(o => o.status === "disputed").length,
    cancelled: orders.filter(o => o.status === "cancelled").length,
  };

  return (
    <div className="min-h-screen bg-[#FFF8F0]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <AdminTopBar title="Orders" back="/admin" />

      <div className="px-4 pt-4 pb-28 max-w-2xl mx-auto space-y-4">

        {/* Campus filter */}
        <CampusPills value={campus} onChange={handleCampus} />

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search order ID, buyer, listing…"
            className="w-full pl-10 pr-4 py-3 bg-white border border-stone-200 rounded-xl text-stone-900 placeholder:text-stone-400 text-sm focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20"
          />
        </div>

        {/* Status tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none [&::-webkit-scrollbar]:hidden">
          {[
            { key: "",                label: "All" },
            { key: "paid",            label: "In Progress" },
            { key: "seller_completed",label: "Awaiting Confirm" },
            { key: "completed",       label: "Completed" },
            { key: "disputed",        label: "Disputed" },
            { key: "cancelled",       label: "Cancelled" },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => handleStatus(t.key)}
              className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 ${
                statusFilter === t.key ? "text-white shadow-sm" : "bg-white border border-stone-200 text-stone-600"
              }`}
              style={statusFilter === t.key ? { background: GRAD } : {}}
            >
              {t.label} ({counts[t.key] ?? 0})
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white border border-stone-200 rounded-2xl h-20 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-stone-100 rounded-2xl p-10 text-center">
            <Package className="w-10 h-10 text-stone-200 mx-auto mb-3" />
            <p className="text-stone-400 text-sm">No orders found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(order => (
              <div
                key={order.id}
                onClick={() => router.push(`/admin/orders/${order.id}`)}
                className="bg-white border border-stone-200 hover:border-teal-300 rounded-2xl p-4 transition-all cursor-pointer active:scale-[0.98] shadow-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-stone-900 text-sm truncate">
                        {order.listing?.title || `Order #${order.id}`}
                      </p>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 ${STATUS_STYLE[order.status] || "bg-stone-100 text-stone-500"}`}>
                        {STATUS_LABELS[order.status] || order.status}
                      </span>
                    </div>
                    <p className="text-stone-400 text-xs">
                      Buyer: {order.buyer?.username || "—"} · #{order.id}
                    </p>
                    {order.created_at && (
                      <p className="text-stone-400 text-xs mt-0.5">
                        {new Date(order.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    {order.total_price && (
                      <p className="font-bold text-stone-900 text-sm">₦{Number(order.total_price).toLocaleString()}</p>
                    )}
                    <ChevronRight className="w-4 h-4 text-stone-400 ml-auto mt-1" />
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
