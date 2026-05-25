"use client";

import { useState, useEffect } from "react";
import { fetchWithAuth } from "@/lib/authStore";
import { GRAD, toArray } from "@/lib/tokens";
import { ShoppingBag, MapPin, Loader } from "lucide-react";
import { StatusBadge, EmptyState, LoadingSpinner, HEADING_FONT } from "../_shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetchWithAuth(`${API_URL}/api/orders/orders/`);
        const data = await res.json();
        setOrders(toArray(data));
      } catch {} finally { setLoading(false); }
    };
    load();
  }, []);

  const markComplete = async (orderId: number) => {
    setMarking(orderId); setError("");
    try {
      const res = await fetchWithAuth(`${API_URL}/api/orders/orders/${orderId}/mark-complete/`, { method: "PATCH" });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || data.error || "Could not mark complete."); return; }
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: "seller_completed" } : o));
    } catch { setError("Network error. Please try again."); }
    finally { setMarking(null); }
  };

  if (loading) return <LoadingSpinner />;

  const activeOrders = orders.filter(o => !["completed", "cancelled"].includes(o.status));

  return (
    <div className="pb-4">
      <div className="mb-5">
        <p className="text-teal-600 text-[10px] tracking-[0.25em] uppercase font-bold mb-0.5">Track</p>
        <h2 className="font-black text-stone-900 text-xl tracking-tight" style={HEADING_FONT}>Active Orders</h2>
        <p className="text-stone-400 text-xs mt-0.5">{activeOrders.length} active</p>
      </div>

      {error && (
        <div className="mb-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600 font-medium">{error}</div>
      )}

      {activeOrders.length === 0 ? (
        <EmptyState icon={ShoppingBag} message="No active orders" />
      ) : (
        <div className="space-y-3">
          {activeOrders.map(order => (
            <div key={order.id} className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-semibold text-stone-900 text-sm">{order.listing?.title}</p>
                  <p className="text-xs text-stone-400">#{order.reference}</p>
                </div>
                <StatusBadge status={order.status} />
              </div>
              <div className="flex items-center justify-between text-sm mb-3">
                <div>
                  <p className="text-xs text-stone-400">Buyer</p>
                  <p className="font-semibold text-stone-800">{order.buyer}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-stone-400">Order total</p>
                  <p className="font-semibold text-stone-800">₦{Number(order.amount).toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-stone-400">Your payout</p>
                  <p className="font-bold text-teal-600">₦{Number(order.listing?.price ?? order.amount).toLocaleString()}</p>
                </div>
              </div>
              <div className="flex items-start gap-1.5 mb-3 bg-stone-50 rounded-xl px-3 py-2">
                <MapPin className="w-3.5 h-3.5 text-teal-500 mt-0.5 shrink-0" />
                <p className="text-xs text-stone-600">
                  {order.delivery_location || <span className="text-stone-400 italic">No delivery location set</span>}
                </p>
              </div>
              {order.status === "paid" && (
                <button onClick={() => markComplete(order.id)} disabled={marking === order.id}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-all active:scale-[0.98]"
                  style={{ background: GRAD }}>
                  {marking === order.id ? "Marking…" : "Mark as Delivered"}
                </button>
              )}
              {order.status === "seller_completed" && (
                <div className="w-full py-2.5 rounded-xl text-sm font-semibold text-center bg-teal-50 text-teal-700 border border-teal-100">
                  Waiting for buyer to confirm
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
