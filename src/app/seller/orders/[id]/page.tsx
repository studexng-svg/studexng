// src/app/seller/orders/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ChevronLeft, Package, DollarSign, User, Clock, CheckCircle,
  AlertCircle, ChevronRight, Utensils, Truck, Bell,
} from "lucide-react";
import Link from "next/link";
import { fetchWithAuth } from "@/lib/authStore";
import { GRAD, SERIF } from "@/lib/tokens";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const TRACKING_STEPS = [
  { key: "paid",      label: "Payment Confirmed",  icon: "💳" },
  { key: "confirmed", label: "Order Confirmed",    icon: "✅" },
  { key: "preparing", label: "Preparing",          icon: "🍳" },
  { key: "ready",     label: "Ready for Pickup",   icon: "📦" },
  { key: "delivered", label: "Delivered",          icon: "🎉" },
];

const NEXT_ACTION: Record<string, { label: string; confirmLabel: string; color: string }> = {
  paid:      { label: "Confirm Order",     confirmLabel: "Confirm this order?",     color: "teal" },
  confirmed: { label: "Start Preparing",   confirmLabel: "Mark as preparing?",      color: "blue" },
  preparing: { label: "Mark as Ready",     confirmLabel: "Mark order as ready?",    color: "amber" },
  ready:     { label: "Mark as Delivered", confirmLabel: "Confirm order delivered?", color: "emerald" },
};

const STATUS_COLOR: Record<string, string> = {
  paid:      "bg-amber-100 text-amber-700",
  confirmed: "bg-blue-100 text-blue-700",
  preparing: "bg-purple-100 text-purple-700",
  ready:     "bg-teal-100 text-teal-700",
  delivered: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-stone-100 text-stone-500",
};

interface Order {
  id: number;
  reference: string;
  buyer: string;
  buyer_id: number;
  amount: number;
  created_at: string;
  status: string;
  current_status: string;
  estimated_time: number | null;
  listing: { id: number; title: string };
}

interface TrackingEntry {
  id: number | null;
  status: string;
  note: string;
  updated_by: string;
  created_at: string;
}

export default function SellerOrderDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [history, setHistory] = useState<TrackingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [note, setNote] = useState("");
  const [estimatedTime, setEstimatedTime] = useState("");

  const loadOrder = async () => {
    try {
      const [orderRes, trackRes] = await Promise.all([
        fetchWithAuth(`${API_URL}/api/orders/orders/${id}/`),
        fetchWithAuth(`${API_URL}/api/orders/orders/${id}/tracking/`),
      ]);
      if (!orderRes.ok) {
        setError(orderRes.status === 404 ? "Order not found" : "Failed to load order");
        return;
      }
      const orderData = await orderRes.json();
      setOrder(orderData);
      if (trackRes.ok) {
        const trackData = await trackRes.json();
        setHistory(trackData.history || []);
      }
    } catch {
      setError("Failed to load order details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadOrder(); }, [id]);

  const handleUpdateStatus = async () => {
    if (!order) return;
    const nextKey = NEXT_ACTION[order.current_status];
    if (!nextKey) return;

    const nextStatus = {
      paid: "confirmed",
      confirmed: "preparing",
      preparing: "ready",
      ready: "delivered",
    }[order.current_status];

    setUpdating(true);
    try {
      const body: Record<string, unknown> = { status: nextStatus, note };
      if (nextStatus === "confirmed" && estimatedTime) {
        body.estimated_time = parseInt(estimatedTime, 10);
      }
      const res = await fetchWithAuth(`${API_URL}/api/orders/orders/${id}/update-status/`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.detail || "Failed to update status");
        return;
      }
      const data = await res.json();
      setOrder(data.order);
      setNote("");
      setEstimatedTime("");
      setShowModal(false);
      await loadOrder();
    } catch {
      alert("Network error. Please try again.");
    } finally {
      setUpdating(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAFAF9]">
      <div className="animate-spin"><Clock className="w-10 h-10 text-teal-600" /></div>
    </div>
  );

  if (error || !order) return (
    <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center p-6" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="text-center bg-white border border-stone-200 rounded-2xl p-8 shadow-sm max-w-sm w-full">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h2 className="text-lg font-bold text-stone-800 mb-2" style={SERIF}>Order Not Found</h2>
        <p className="text-sm text-stone-500 mb-6">{error || "This order may have been removed."}</p>
        <Link href="/seller/orders">
          <button className="px-8 py-3 text-white font-semibold rounded-full shadow-md text-sm" style={{ background: GRAD }}>
            Back to Orders
          </button>
        </Link>
      </div>
    </div>
  );

  const nextAction = NEXT_ACTION[order.current_status];
  const isActive = order.status === "paid" || order.status === "seller_completed";
  const isCompleted = order.status === "completed";
  const isCancelled = order.status === "cancelled" || order.current_status === "cancelled";

  const currentStepIndex = TRACKING_STEPS.findIndex(s => s.key === order.current_status);

  return (
    <div className="min-h-screen bg-[#FAFAF9]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* HEADER */}
      <div className="sticky top-0 bg-white/80 backdrop-blur-md z-40 border-b border-stone-100 shadow-sm">
        <div className="flex items-center justify-between px-4 py-3 max-w-2xl mx-auto">
          <button onClick={() => router.back()} className="p-2.5 bg-white border border-stone-200 rounded-full shadow-sm active:scale-95 transition-all">
            <ChevronLeft className="w-5 h-5 text-stone-600" />
          </button>
          <h1 className="text-base font-bold text-stone-900" style={SERIF}>Order Details</h1>
          <div className="w-10" />
        </div>
      </div>

      <div className="px-4 pt-6 pb-32 space-y-4 max-w-2xl mx-auto">

        {/* ORDER HEADER */}
        <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm flex justify-between items-start animate-fadeUp">
          <div>
            <p className="text-xs text-stone-400 font-medium">Order Reference</p>
            <p className="text-xl font-bold text-stone-900 mt-0.5">#{order.reference}</p>
            <p className="text-xs text-stone-400 mt-1">{new Date(order.created_at).toLocaleString("en-NG")}</p>
          </div>
          <span className={`px-3 py-1.5 rounded-full font-semibold text-xs flex items-center gap-1.5 ${STATUS_COLOR[order.current_status] || "bg-stone-100 text-stone-500"}`}>
            {TRACKING_STEPS.find(s => s.key === order.current_status)?.icon}{" "}
            {TRACKING_STEPS.find(s => s.key === order.current_status)?.label || order.current_status}
          </span>
        </div>

        {/* TRACKING TIMELINE */}
        <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm animate-fadeUp">
          <p className="text-xs font-semibold text-teal-600 tracking-widest uppercase mb-4">Order Progress</p>
          {order.estimated_time && (
            <div className="flex items-center gap-2 mb-4 p-3 bg-teal-50 rounded-xl border border-teal-100">
              <Clock className="w-4 h-4 text-teal-600 flex-shrink-0" />
              <p className="text-sm text-teal-800 font-medium">Estimated: {order.estimated_time} minutes</p>
            </div>
          )}
          <div className="space-y-0">
            {TRACKING_STEPS.map((step, i) => {
              const isDone = i <= currentStepIndex && !isCancelled;
              const isCurrent = i === currentStepIndex && !isCancelled;
              const histEntry = history.find(h => h.status === step.key);
              return (
                <div key={step.key} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 transition-all ${
                      isCurrent ? "ring-2 ring-teal-400 ring-offset-2" : ""
                    } ${isDone ? "bg-teal-500 text-white" : "bg-stone-100 text-stone-400"}`}>
                      {isDone ? <CheckCircle className="w-4 h-4" /> : <span className="text-xs">{i + 1}</span>}
                    </div>
                    {i < TRACKING_STEPS.length - 1 && (
                      <div className={`w-0.5 h-8 mt-1 ${isDone && i < currentStepIndex ? "bg-teal-400" : "bg-stone-200"}`} />
                    )}
                  </div>
                  <div className="pb-4 flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${isDone ? "text-stone-900" : "text-stone-400"}`}>
                      {step.icon} {step.label}
                    </p>
                    {histEntry && (
                      <p className="text-xs text-stone-400 mt-0.5">
                        {new Date(histEntry.created_at).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })}
                        {histEntry.note ? ` · "${histEntry.note}"` : ""}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
            {isCancelled && (
              <div className="flex gap-3 mt-1">
                <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="w-4 h-4 text-red-500" />
                </div>
                <div className="pb-4">
                  <p className="text-sm font-semibold text-red-600">Cancelled</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* CUSTOMER + LISTING */}
        <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm animate-fadeUp">
          <h3 className="font-semibold text-stone-800 mb-3 flex items-center gap-2 text-sm">
            <User className="w-4 h-4 text-teal-600" /> Customer & Order
          </h3>
          <div className="space-y-2">
            <div className="flex justify-between py-2 border-b border-stone-50">
              <span className="text-sm text-stone-400">Buyer</span>
              <span className="font-semibold text-stone-800 text-sm">{order.buyer}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-stone-50">
              <span className="text-sm text-stone-400">Item</span>
              <span className="font-semibold text-stone-800 text-sm">{order.listing?.title}</span>
            </div>
            <div className="flex justify-between pt-2">
              <span className="font-semibold text-stone-700">Amount</span>
              <span className="font-bold text-2xl text-teal-700">
                ₦{parseFloat(String(order.amount)).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
          {order.status === "seller_completed" && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mt-3">
              Awaiting buyer confirmation to release payment.
            </p>
          )}
          {isCompleted && (
            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 mt-3">
              ✓ Completed — payment has been released to your account.
            </p>
          )}
        </div>

        {/* STATUS UPDATE ACTION */}
        {isActive && nextAction && order.current_status !== "delivered" && (
          <div className="space-y-3 animate-fadeUp">
            <button
              onClick={() => setShowModal(true)}
              className="w-full py-4 text-white font-semibold rounded-full shadow-lg flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
              style={{ background: GRAD }}
            >
              <ChevronRight className="w-5 h-5" />
              {nextAction.label}
            </button>
          </div>
        )}

        {order.current_status === "delivered" && order.status === "seller_completed" && (
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-center animate-fadeUp">
            <Bell className="w-6 h-6 text-blue-500 mx-auto mb-2" />
            <p className="text-sm font-semibold text-blue-900">Awaiting Buyer Confirmation</p>
            <p className="text-xs text-blue-700 mt-1">Buyer will confirm receipt to release your payment.</p>
          </div>
        )}
      </div>

      {/* STATUS UPDATE MODAL */}
      {showModal && nextAction && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4 animate-fadeIn"
          onClick={() => !updating && setShowModal(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border border-stone-100 mb-20 sm:mb-0 animate-fadeUp"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-stone-900 mb-1" style={SERIF}>{nextAction.confirmLabel}</h3>
            <p className="text-xs text-stone-400 mb-4">Order #{order.reference} · {order.buyer}</p>

            {order.current_status === "paid" && (
              <div className="mb-4">
                <label className="text-xs font-semibold text-stone-600 mb-1.5 block">
                  Estimated time (minutes) — optional
                </label>
                <input
                  type="number"
                  min="1"
                  value={estimatedTime}
                  onChange={e => setEstimatedTime(e.target.value)}
                  placeholder="e.g. 20"
                  className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 focus:outline-none focus:border-teal-400"
                />
              </div>
            )}

            <div className="mb-5">
              <label className="text-xs font-semibold text-stone-600 mb-1.5 block">
                Message to buyer — optional
              </label>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                rows={2}
                placeholder="e.g. 'Your food will be ready in 15 mins!'"
                className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 focus:outline-none focus:border-teal-400 resize-none"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                disabled={updating}
                className="flex-1 py-3 bg-stone-100 text-stone-700 rounded-full font-semibold text-sm disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateStatus}
                disabled={updating}
                className="flex-1 py-3 text-white rounded-full font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: GRAD }}
              >
                {updating
                  ? <><div className="animate-spin"><Clock className="w-4 h-4" /></div> Updating…</>
                  : <><CheckCircle className="w-4 h-4" /> Confirm</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
