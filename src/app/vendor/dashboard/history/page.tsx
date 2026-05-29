"use client";

import { useState, useEffect } from "react";
import { fetchWithAuth } from "@/lib/authStore";
import { GRAD, toArray } from "@/lib/tokens";
import { History, TrendingUp, Download, Calendar, User, Package } from "lucide-react";
import { EmptyState, LoadingSpinner, HEADING_FONT } from "../_shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

type DateFilter = "all" | "week" | "month";

export default function HistoryPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [tab, setTab] = useState<"orders" | "bookings">("orders");

  useEffect(() => {
    const load = async () => {
      try {
        const [ordersRes, bookingsRes] = await Promise.all([
          fetchWithAuth(`${API_URL}/api/orders/orders/`),
          fetchWithAuth(`${API_URL}/api/orders/bookings/`),
        ]);
        if (ordersRes.ok) {
          const data = toArray(await ordersRes.json());
          setOrders(data.filter((o: any) => ["paid", "seller_completed", "completed"].includes(o.status)));
        }
        if (bookingsRes.ok) {
          const data = toArray(await bookingsRes.json());
          setBookings(data.filter((b: any) => b.status === "completed" || b.status === "cancelled"));
        }
      } catch {} finally { setLoading(false); }
    };
    load();
  }, []);

  const applyDateFilter = (list: any[], dateKey = "created_at") => {
    if (dateFilter === "all") return list;
    const now = Date.now();
    const cutoff = dateFilter === "week"
      ? now - 7 * 24 * 60 * 60 * 1000
      : now - 30 * 24 * 60 * 60 * 1000;
    return list.filter(item => new Date(item[dateKey]).getTime() >= cutoff);
  };

  const filteredOrders = applyDateFilter(orders);
  const filteredBookings = applyDateFilter(bookings, "scheduled_date");
  const totalRevenue = filteredOrders.reduce((s, o) => s + parseFloat(String(o.listing?.price ?? o.amount ?? 0)), 0);

  const handleDownloadCSV = () => {
    const rows = tab === "orders"
      ? [
          ["Reference", "Buyer", "Service", "Amount", "Date"],
          ...filteredOrders.map(o => [
            o.reference, o.buyer, o.listing?.title,
            `₦${Number(o.listing?.price ?? o.amount).toLocaleString()}`,
            new Date(o.created_at).toLocaleDateString("en-GB"),
          ]),
        ]
      : [
          ["Booking ID", "Buyer", "Service", "Date", "Status"],
          ...filteredBookings.map(b => [
            b.id, b.buyer_username, b.listing_title,
            b.scheduled_date, b.status,
          ]),
        ];

    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tab}-history-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="pb-4 space-y-5">
      {/* Header */}
      <div>
        <p className="text-teal-600 text-[10px] tracking-[0.25em] uppercase font-bold mb-0.5">Record</p>
        <h2 className="font-black text-stone-900 text-xl tracking-tight" style={HEADING_FONT}>History</h2>
      </div>

      {/* Summary card */}
      <div className="rounded-2xl p-5 text-white shadow-md" style={{ background: GRAD }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            <span className="font-semibold text-sm opacity-90">Completed Orders Revenue</span>
          </div>
          <button onClick={handleDownloadCSV}
            className="bg-white/20 hover:bg-white/30 p-2 rounded-full transition" title="Download CSV">
            <Download className="w-4 h-4" />
          </button>
        </div>
        <p className="text-3xl font-bold">₦{totalRevenue.toLocaleString()}</p>
        <p className="text-sm opacity-75 mt-1">
          From {filteredOrders.length} completed order{filteredOrders.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Tabs: orders vs bookings */}
      <div className="flex gap-2">
        {(["orders", "bookings"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-full text-sm font-medium capitalize transition-all ${
              tab === t ? "text-white shadow-sm" : "bg-white border border-stone-200 text-stone-600"
            }`}
            style={tab === t ? { background: GRAD } : {}}>
            {t}
          </button>
        ))}
      </div>

      {/* Date filter */}
      <div className="flex gap-2">
        {(["all", "week", "month"] as const).map(f => (
          <button key={f} onClick={() => setDateFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              dateFilter === f ? "text-white" : "bg-white border border-stone-200 text-stone-500"
            }`}
            style={dateFilter === f ? { background: GRAD } : {}}>
            {f === "all" ? "All Time" : f === "week" ? "This Week" : "This Month"}
          </button>
        ))}
      </div>

      {/* Orders history */}
      {tab === "orders" && (
        filteredOrders.length === 0 ? (
          <EmptyState icon={Package} message="No completed orders yet" />
        ) : (
          <div className="space-y-3">
            {filteredOrders.map(order => (
              <div key={order.id} className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-semibold text-stone-900 text-sm">#{order.reference}</p>
                    <p className="text-xs text-stone-400 flex items-center gap-1 mt-0.5">
                      <Calendar className="w-3 h-3" />
                      {new Date(order.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                    <p className="text-sm font-medium text-stone-800 mt-2">{order.listing?.title}</p>
                    <p className="text-xs text-stone-500 flex items-center gap-1 mt-0.5">
                      <User className="w-3 h-3" /> {order.buyer}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0 ml-4">
                    <p className="text-xl font-bold text-emerald-600">
                      ₦{Number(order.listing?.price ?? order.amount).toLocaleString()}
                    </p>
                    <span className={`mt-1 px-2.5 py-0.5 rounded-full text-xs font-medium inline-block ${
                      order.status === "completed" ? "bg-emerald-50 text-emerald-700"
                      : order.status === "seller_completed" ? "bg-teal-50 text-teal-700"
                      : "bg-amber-50 text-amber-700"
                    }`}>
                      {order.status === "completed" ? "✓ Completed"
                        : order.status === "seller_completed" ? "⏳ Awaiting Confirmation"
                        : "💰 Paid — In Progress"}
                    </span>
                  </div>
                </div>
              </div>
            ))}

            <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
              <p className="text-sm text-stone-700">
                <span className="font-semibold">Total for this period: </span>
                <span className="text-teal-600 font-bold">₦{totalRevenue.toLocaleString()}</span>
                {" "}({filteredOrders.length} order{filteredOrders.length !== 1 ? "s" : ""})
              </p>
            </div>
          </div>
        )
      )}

      {/* Bookings history */}
      {tab === "bookings" && (
        filteredBookings.length === 0 ? (
          <EmptyState icon={History} message="No past bookings yet" />
        ) : (
          <div className="space-y-3">
            {filteredBookings.map(booking => (
              <div key={booking.id} className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-semibold text-stone-900 text-sm">{booking.listing_title}</p>
                    <p className="text-xs text-stone-500 flex items-center gap-1 mt-0.5">
                      <User className="w-3 h-3" /> {booking.buyer_username}
                    </p>
                    <p className="text-xs text-stone-400 flex items-center gap-1 mt-1">
                      <Calendar className="w-3 h-3" /> {booking.scheduled_date} · {booking.scheduled_time}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0 ml-4">
                    <p className="text-lg font-bold text-stone-800">₦{Number(booking.listing_price || 0).toLocaleString()}</p>
                    <span className={`mt-1 px-2.5 py-0.5 rounded-full text-xs font-medium inline-block ${
                      booking.status === "completed" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
                    }`}>
                      {booking.status === "completed" ? "✓ Completed" : "✕ Cancelled"}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
