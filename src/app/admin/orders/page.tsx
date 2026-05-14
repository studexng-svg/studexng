// src/app/admin/orders/page.tsx
"use client";

import {
  Package, Clock, CheckCircle, AlertCircle, Search, ChevronRight,
} from "lucide-react";
import { useRouter } from "next/navigation";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { useState, useEffect, useMemo } from "react";
import { fetchWithAuth } from "@/lib/authStore";
import { GRAD } from "@/lib/tokens";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  disputed: "Disputed",
};

const STATUS_STYLE: Record<string, string> = {
  pending:   "bg-amber-100 text-amber-700",
  confirmed: "bg-blue-100 text-blue-700",
  completed: "bg-teal-100 text-teal-700",
  cancelled: "bg-stone-100 text-stone-500",
  disputed:  "bg-red-100 text-red-700",
};

export default function AdminOrders() {
  const router = useRouter();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    fetchWithAuth(`${API_URL}/api/admin/orders/`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setOrders(d.results || d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let list = orders;
    if (statusFilter !== "all") list = list.filter(o => o.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(o =>
        String(o.id).includes(q) ||
        o.buyer?.username?.toLowerCase().includes(q) ||
        o.listing?.title?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [orders, statusFilter, search]);

  const tabs = [
    { key: "all",       label: "All",       count: orders.length },
    { key: "pending",   label: "Pending",   count: orders.filter(o => o.status === "pending").length },
    { key: "completed", label: "Completed", count: orders.filter(o => o.status === "completed").length },
    { key: "disputed",  label: "Disputed",  count: orders.filter(o => o.status === "disputed").length },
  ].filter(t => t.key === "all" || t.count > 0);

  return (
    <div className="min-h-screen bg-[#FFF8F0]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <AdminTopBar title="Orders" back="/admin" />

      <div className="px-4 pt-4 pb-28 max-w-2xl mx-auto space-y-4">

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

        {/* Filter tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setStatusFilter(t.key)}
              className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all flex-shrink-0 ${
                statusFilter === t.key
                  ? "text-white shadow-sm"
                  : "bg-white border border-stone-200 text-stone-600"
              }`}
              style={statusFilter === t.key ? { background: GRAD } : {}}
            >
              {t.label} ({t.count})
            </button>
          ))}
        </div>

        {/* Orders */}
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
