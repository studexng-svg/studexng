// src/app/admin/orders/[id]/page.tsx
"use client";

import { Package, Clock, CheckCircle, AlertCircle, RefreshCw } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { fetchWithAuth } from "@/lib/authStore";
import { GRAD } from "@/lib/tokens";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const STATUS_STYLE: Record<string, string> = {
  pending:          "bg-amber-100 text-amber-700",
  paid:             "bg-amber-100 text-amber-700",
  seller_completed: "bg-blue-100 text-blue-700",
  completed:        "bg-teal-100 text-teal-700",
  cancelled:        "bg-stone-100 text-stone-500",
  disputed:         "bg-red-100 text-red-700",
};

const TRACKING_STEPS = [
  { key: "paid",      label: "Payment Confirmed", icon: "💳" },
  { key: "confirmed", label: "Order Confirmed",   icon: "✅" },
  { key: "preparing", label: "Preparing",         icon: "🍳" },
  { key: "ready",     label: "Ready for Pickup",  icon: "📦" },
  { key: "delivered", label: "Delivered",         icon: "🎉" },
];

const STATUS_ORDER = ["paid", "confirmed", "preparing", "ready", "delivered"];

function Row({ label, value }: { label: string; value?: string | number | null }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex items-center justify-between py-3 border-b border-stone-100 last:border-0">
      <p className="text-stone-500 text-sm">{label}</p>
      <p className="font-semibold text-stone-900 text-sm">{value}</p>
    </div>
  );
}

interface TrackingEntry {
  id: number | null;
  status: string;
  note: string;
  updated_by: string;
  created_at: string;
}

export default function AdminOrderDetail() {
  const { id } = useParams();
  const router = useRouter();
  const [order, setOrder] = useState<any>(null);
  const [tracking, setTracking] = useState<{ history: TrackingEntry[]; current_status: string; estimated_time: number | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [orderRes, trackRes] = await Promise.all([
        fetchWithAuth(`${API_URL}/api/admin/orders/${id}/`),
        fetchWithAuth(`${API_URL}/api/orders/orders/${id}/tracking/`),
      ]);
      if (orderRes.ok) setOrder(await orderRes.json());
      if (trackRes.ok) setTracking(await trackRes.json());
      setLastRefresh(new Date());
    } catch {}
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    load();
    const interval = setInterval(() => load(true), 30_000);
    return () => clearInterval(interval);
  }, [id, load]);

  const updateStatus = async (newStatus: string) => {
    if (!order) return;
    setUpdating(true);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/admin/orders/${id}/`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) setOrder(await res.json());
    } catch {}
    finally { setUpdating(false); }
  };

  if (loading) return (
    <div className="min-h-screen bg-[#FFF8F0] flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-stone-200 border-t-teal-500 rounded-full animate-spin" />
    </div>
  );

  if (!order) return (
    <div className="min-h-screen bg-[#FFF8F0] flex flex-col items-center justify-center gap-4">
      <Package className="w-12 h-12 text-stone-300" />
      <p className="text-stone-500">Order not found</p>
      <button onClick={() => router.back()} className="px-5 py-2.5 bg-white border border-stone-200 rounded-full text-sm font-semibold">
        Go back
      </button>
    </div>
  );

  const currentTrackingStep = tracking?.current_status ?? "paid";
  const currentStepIndex = STATUS_ORDER.indexOf(currentTrackingStep);
  const isCancelled = order.status === "cancelled" || currentTrackingStep === "cancelled";

  return (
    <div className="min-h-screen bg-[#FFF8F0]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <AdminTopBar title={`Order #${order.id}`} back="/admin/orders" />

      <div className="px-4 pt-5 pb-28 max-w-2xl mx-auto space-y-4">

        {/* Refresh indicator */}
        <div className="flex items-center justify-between text-xs text-stone-400 px-1">
          <span>Last refreshed: {lastRefresh.toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })}</span>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="flex items-center gap-1 text-teal-600 font-medium disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* Status */}
        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <p className="text-stone-600 text-sm font-medium">Escrow Status</p>
          <span className={`px-3 py-1 rounded-full text-xs font-bold ${STATUS_STYLE[order.status] || "bg-stone-100 text-stone-600"}`}>
            {order.status?.charAt(0).toUpperCase() + order.status?.slice(1).replace("_", " ")}
          </span>
        </div>

        {/* Live Tracking */}
        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <p className="text-teal-600 text-xs tracking-[0.2em] uppercase font-semibold">Live Tracking</p>
            {tracking?.estimated_time && (
              <span className="text-xs bg-teal-50 text-teal-700 border border-teal-100 px-2.5 py-1 rounded-full font-medium flex items-center gap-1">
                <Clock className="w-3 h-3" /> ~{tracking.estimated_time} min
              </span>
            )}
          </div>
          {!isCancelled ? (
            <div className="space-y-0">
              {TRACKING_STEPS.map((step, i) => {
                const stepDone = i <= currentStepIndex;
                const isCurrent = i === currentStepIndex;
                const histEntry = tracking?.history?.find(h => h.status === step.key);
                return (
                  <div key={step.key} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs flex-shrink-0 transition-all ${
                        isCurrent ? "ring-2 ring-teal-400 ring-offset-1" : ""
                      } ${stepDone ? "bg-teal-500 text-white" : "bg-stone-100 text-stone-400"}`}>
                        {stepDone ? <CheckCircle className="w-4 h-4" /> : step.icon}
                      </div>
                      {i < TRACKING_STEPS.length - 1 && (
                        <div className={`w-0.5 h-7 mt-0.5 ${stepDone && i < currentStepIndex ? "bg-teal-400" : "bg-stone-200"}`} />
                      )}
                    </div>
                    <div className="pb-4 flex-1 min-w-0">
                      <p className={`text-sm font-semibold ${stepDone ? "text-stone-900" : "text-stone-400"}`}>
                        {step.label}
                      </p>
                      {histEntry && (
                        <p className="text-xs text-stone-400 mt-0.5">
                          {new Date(histEntry.created_at).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                          {histEntry.note ? ` · "${histEntry.note}"` : ""}
                          {histEntry.updated_by ? ` · by ${histEntry.updated_by}` : ""}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-xl p-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm font-semibold">Order Cancelled</span>
            </div>
          )}
        </div>

        {/* Details */}
        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
          <p className="text-teal-600 text-xs tracking-[0.2em] uppercase font-semibold mb-2">Order Details</p>
          <Row label="Order ID"   value={`#${order.id}`} />
          <Row label="Reference"  value={order.reference} />
          <Row label="Listing"    value={order.listing?.title} />
          <Row label="Buyer"      value={order.buyer?.username} />
          <Row label="Vendor"     value={order.listing?.vendor?.username} />
          <Row label="Amount"     value={order.amount ? `₦${Number(order.amount).toLocaleString()}` : undefined} />
          <Row label="Date"       value={order.created_at ? new Date(order.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : undefined} />
        </div>

        {/* Admin Actions */}
        {(order.status === "pending" || order.status === "paid") && (
          <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm space-y-2">
            <p className="text-teal-600 text-xs tracking-[0.2em] uppercase font-semibold mb-3">Admin Actions</p>
            <button onClick={() => updateStatus("completed")} disabled={updating}
              className="w-full py-3 text-white font-semibold rounded-xl text-sm disabled:opacity-50 transition"
              style={{ background: GRAD }}>
              {updating ? "Updating…" : "Mark as Completed"}
            </button>
            <button onClick={() => updateStatus("cancelled")} disabled={updating}
              className="w-full py-3 bg-red-100 text-red-700 font-semibold rounded-xl text-sm disabled:opacity-50 transition hover:bg-red-200">
              {updating ? "Updating…" : "Cancel Order"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
