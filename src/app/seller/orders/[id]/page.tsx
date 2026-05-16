// src/app/seller/orders/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ChevronLeft, User, Clock, CheckCircle, AlertCircle,
  ChevronRight, Bell, CreditCard, ChefHat, Package,
  PartyPopper, XCircle,
} from "lucide-react";
import Link from "next/link";
import { useAuth, fetchWithAuth } from "@/lib/authStore";
import { GRAD, SERIF } from "@/lib/tokens";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const STEP_CONFIG = {
  paid:      { Icon: CreditCard,  iconColor: "#10b981", bg: "bg-emerald-50",  label: "Payment Confirmed" },
  confirmed: { Icon: CheckCircle, iconColor: "#6366f1", bg: "bg-indigo-50",   label: "Order Confirmed"   },
  preparing: { Icon: ChefHat,     iconColor: "#f59e0b", bg: "bg-amber-50",    label: "Preparing"         },
  ready:     { Icon: Package,     iconColor: "#0ea5e9", bg: "bg-sky-50",      label: "Ready for Pickup"  },
  delivered: { Icon: PartyPopper, iconColor: "#ec4899", bg: "bg-pink-50",     label: "Delivered"         },
  cancelled: { Icon: XCircle,     iconColor: "#ef4444", bg: "bg-red-50",      label: "Cancelled"         },
} as const;

const TRACKING_STEPS = ["paid", "confirmed", "preparing", "ready", "delivered"] as const;
type TrackingKey = keyof typeof STEP_CONFIG;

const NEXT_ACTION: Record<string, { label: string; confirmLabel: string }> = {
  paid:      { label: "Confirm Order",     confirmLabel: "Confirm this order?" },
  confirmed: { label: "Start Preparing",   confirmLabel: "Mark as preparing?"  },
  preparing: { label: "Mark as Ready",     confirmLabel: "Mark order as ready?" },
  ready:     { label: "Mark as Delivered", confirmLabel: "Confirm order delivered?" },
};

const CURRENT_STATUS_BADGE: Record<string, string> = {
  paid:      "bg-amber-100 text-amber-700",
  confirmed: "bg-indigo-100 text-indigo-700",
  preparing: "bg-amber-100 text-amber-700",
  ready:     "bg-sky-100 text-sky-700",
  delivered: "bg-pink-100 text-pink-700",
  cancelled: "bg-stone-100 text-stone-500",
};

interface Order {
  id: number;
  reference: string;
  buyer: string;
  amount: number;
  created_at: string;
  status: string;
  current_status: string;
  estimated_time: number | null;
  listing: { id: number; title: string; price: number };
}

interface TrackingEntry {
  id: number | null;
  status: string;
  note: string;
  updated_by: string;
  created_at: string;
}

export default function SellerOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { isLoggedIn, isHydrated } = useAuth();

  const rawId = params?.id;
  const orderId = (Array.isArray(rawId) ? rawId[0] : rawId) ?? "";

  const [order, setOrder] = useState<Order | null>(null);
  const [history, setHistory] = useState<TrackingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [note, setNote] = useState("");
  const [estimatedTime, setEstimatedTime] = useState("");

  useEffect(() => {
    if (isHydrated && !isLoggedIn) { router.push("/auth"); return; }
    if (!isHydrated || !isLoggedIn || !orderId) return;

    const loadOrder = async () => {
      setLoading(true);
      try {
        const orderRes = await fetchWithAuth(`${API_URL}/api/orders/orders/${orderId}/`);

        if (orderRes.status === 401 || orderRes.status === 403) {
          router.push("/auth");
          return;
        }
        if (!orderRes.ok) {
          const statusText = orderRes.status === 404 ? "Order not found" : `Failed to load order (${orderRes.status})`;
          console.error("Seller order fetch failed:", orderRes.status, orderId);
          setError(statusText);
          return;
        }

        setOrder(await orderRes.json());

        // Tracking history is best-effort — don't let it block the order view
        try {
          const trackRes = await fetchWithAuth(`${API_URL}/api/orders/orders/${orderId}/tracking/`);
          if (trackRes.ok) {
            const t = await trackRes.json();
            setHistory(t.history || []);
          }
        } catch (trackErr) {
          console.warn("Tracking fetch failed (non-critical):", trackErr);
        }
      } catch (err) {
        console.error("Order load error:", err);
        setError("Network error. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    loadOrder();
  }, [isHydrated, isLoggedIn, orderId, router]);

  const handleUpdateStatus = async () => {
    if (!order) return;
    const nextStatus = ({
      paid: "confirmed", confirmed: "preparing",
      preparing: "ready", ready: "delivered",
    } as Record<string, string>)[order.current_status];
    if (!nextStatus) return;

    setUpdating(true);
    try {
      const body: Record<string, unknown> = { status: nextStatus, note };
      if (nextStatus === "confirmed" && estimatedTime) body.estimated_time = parseInt(estimatedTime, 10);

      const res = await fetchWithAuth(`${API_URL}/api/orders/orders/${orderId}/update-status/`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.error("Status update failed:", res.status, errData);
        alert(errData.detail || `Failed to update status (${res.status})`);
        return;
      }
      const data = await res.json();
      setOrder(data.order);
      setNote(""); setEstimatedTime(""); setShowModal(false);

      // Reload tracking history
      try {
        const trackRes = await fetchWithAuth(`${API_URL}/api/orders/orders/${orderId}/tracking/`);
        if (trackRes.ok) { const t = await trackRes.json(); setHistory(t.history || []); }
      } catch {}
    } catch (err) {
      console.error("Status update network error:", err);
      alert("Network error. Please try again.");
    } finally {
      setUpdating(false);
    }
  };

  if (!isHydrated || loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAFAF9]">
      <div className="animate-spin"><Clock className="w-10 h-10 text-teal-600" /></div>
    </div>
  );

  if (error || !order) return (
    <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center p-6" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="text-center bg-white border border-stone-200 rounded-2xl p-8 shadow-sm max-w-sm w-full">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h2 className="text-lg font-bold text-stone-800 mb-2" style={SERIF}>Order Not Found</h2>
        <p className="text-sm text-stone-500 mb-6">{error || "This order could not be loaded."}</p>
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

  const currentStepIndex = TRACKING_STEPS.indexOf(order.current_status as typeof TRACKING_STEPS[number]);
  const badgeConfig = STEP_CONFIG[order.current_status as TrackingKey] ?? STEP_CONFIG.paid;

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
          <span className={`px-3 py-1.5 rounded-full font-semibold text-xs flex items-center gap-1.5 ${CURRENT_STATUS_BADGE[order.current_status] || "bg-stone-100 text-stone-500"}`}>
            <badgeConfig.Icon className="w-3.5 h-3.5" style={{ color: badgeConfig.iconColor }} />
            {badgeConfig.label}
          </span>
        </div>

        {/* TRACKING TIMELINE */}
        <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm animate-fadeUp">
          <div className="flex items-center justify-between mb-5">
            <p className="text-xs font-semibold text-teal-600 tracking-widest uppercase">Order Progress</p>
            {order.estimated_time && (
              <span className="text-xs bg-teal-50 text-teal-700 border border-teal-100 px-2.5 py-1 rounded-full font-medium flex items-center gap-1">
                <Clock className="w-3 h-3" /> ~{order.estimated_time} min
              </span>
            )}
          </div>

          <div className="space-y-0">
            {TRACKING_STEPS.map((stepKey, i) => {
              const cfg = STEP_CONFIG[stepKey];
              const isDone = !isCancelled && i <= currentStepIndex;
              const isCurrent = !isCancelled && i === currentStepIndex;
              const histEntry = history.find(h => h.status === stepKey);

              return (
                <div key={stepKey} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${isDone ? cfg.bg : "bg-stone-100"}`}
                      style={isCurrent ? { boxShadow: `0 0 0 3px white, 0 0 0 5px ${cfg.iconColor}` } : {}}
                    >
                      <cfg.Icon
                        className="w-5 h-5"
                        style={{ color: isDone ? cfg.iconColor : "#d6d3d1" }}
                      />
                    </div>
                    {i < TRACKING_STEPS.length - 1 && (
                      <div className={`w-0.5 h-8 mt-1 transition-all ${isDone && i < currentStepIndex ? "bg-gradient-to-b from-teal-400 to-stone-200" : "bg-stone-100"}`} />
                    )}
                  </div>
                  <div className="pb-5 flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${isDone ? "text-stone-900" : "text-stone-400"}`}>
                      {cfg.label}
                    </p>
                    {histEntry ? (
                      <div className="mt-0.5">
                        <p className="text-xs text-stone-400">
                          {new Date(histEntry.created_at).toLocaleString("en-NG", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}
                        </p>
                        {histEntry.note && (
                          <p className="text-xs italic mt-1 px-2.5 py-1.5 rounded-lg border" style={{ color: cfg.iconColor, borderColor: `${cfg.iconColor}30`, backgroundColor: `${cfg.iconColor}08` }}>
                            "{histEntry.note}"
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-stone-300 mt-0.5">{isCurrent ? "In progress" : isDone ? "Done" : "Pending"}</p>
                    )}
                  </div>
                </div>
              );
            })}

            {isCancelled && (
              <div className="flex gap-3 mt-1">
                <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                  <XCircle className="w-5 h-5 text-red-500" />
                </div>
                <div className="pb-4 flex-1">
                  <p className="text-sm font-semibold text-red-600">Cancelled</p>
                  <p className="text-xs text-stone-400 mt-0.5">This order was cancelled.</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ORDER INFO */}
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
            <div className="flex justify-between py-2 border-b border-stone-50">
              <span className="text-sm text-stone-400">Order Total</span>
              <span className="text-sm text-stone-500">
                ₦{Number(order.amount).toLocaleString("en-NG")}
              </span>
            </div>
            <div className="flex justify-between pt-2">
              <span className="font-semibold text-stone-700">Your Payout</span>
              <span className="font-bold text-2xl text-teal-700">
                ₦{Number(order.listing?.price ?? order.amount).toLocaleString("en-NG")}
              </span>
            </div>
          </div>
          {order.status === "seller_completed" && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mt-3">
              Waiting for buyer to confirm receipt and release your payment.
            </p>
          )}
          {isCompleted && (
            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 mt-3">
              ✓ Completed — payment has been released to your account.
            </p>
          )}
        </div>

        {/* ACTION BUTTON */}
        {isActive && nextAction && order.current_status !== "delivered" && (
          <button
            onClick={() => setShowModal(true)}
            className="w-full py-4 text-white font-semibold rounded-full shadow-lg flex items-center justify-center gap-2 active:scale-[0.98] transition-all animate-fadeUp"
            style={{ background: GRAD }}
          >
            <ChevronRight className="w-5 h-5" />
            {nextAction.label}
          </button>
        )}

        {order.current_status === "delivered" && order.status === "seller_completed" && (
          <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 text-center animate-fadeUp">
            <Bell className="w-6 h-6 text-indigo-500 mx-auto mb-2" />
            <p className="text-sm font-semibold text-indigo-900">Awaiting Buyer Confirmation</p>
            <p className="text-xs text-indigo-700 mt-1">The buyer needs to confirm receipt to release your payment.</p>
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
                <label className="text-xs font-semibold text-stone-600 mb-1.5 block">Estimated time (minutes) — optional</label>
                <input
                  type="number" min="1" value={estimatedTime}
                  onChange={e => setEstimatedTime(e.target.value)}
                  placeholder="e.g. 20"
                  className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-teal-400"
                />
              </div>
            )}

            <div className="mb-5">
              <label className="text-xs font-semibold text-stone-600 mb-1.5 block">Message to buyer — optional</label>
              <textarea
                value={note} onChange={e => setNote(e.target.value)} rows={2}
                placeholder="e.g. 'Ready in 15 mins!'"
                className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-teal-400 resize-none"
              />
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowModal(false)} disabled={updating}
                className="flex-1 py-3 bg-stone-100 text-stone-700 rounded-full font-semibold text-sm disabled:opacity-50">
                Cancel
              </button>
              <button onClick={handleUpdateStatus} disabled={updating}
                className="flex-1 py-3 text-white rounded-full font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: GRAD }}>
                {updating
                  ? <><div className="animate-spin"><Clock className="w-4 h-4" /></div> Updating…</>
                  : <><CheckCircle className="w-4 h-4" /> Confirm</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
