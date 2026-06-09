"use client";

import { useState, useEffect, useRef } from "react";
import { fetchWithAuth } from "@/lib/authStore";
import { GRAD, toArray } from "@/lib/tokens";
import { ShoppingBag, MapPin, Camera, X, ImagePlus } from "lucide-react";
import { StatusBadge, EmptyState, LoadingSpinner, HEADING_FONT } from "../_shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

function ProofModal({ order, onSuccess, onClose }: {
  order: any;
  onSuccess: (orderId: number) => void;
  onClose: () => void;
}) {
  const [files, setFiles] = useState<(File | null)[]>([null, null]);
  const [previews, setPreviews] = useState<(string | null)[]>([null, null]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const input1 = useRef<HTMLInputElement>(null);
  const input2 = useRef<HTMLInputElement>(null);

  const pick = (idx: number, file: File) => {
    const f = [...files]; f[idx] = file;
    const p = [...previews]; p[idx] = URL.createObjectURL(file);
    setFiles(f); setPreviews(p);
  };

  const remove = (idx: number) => {
    const f = [...files]; f[idx] = null;
    const p = [...previews]; if (p[idx]) URL.revokeObjectURL(p[idx]!); p[idx] = null;
    setFiles(f); setPreviews(p);
  };

  const submit = async () => {
    if (!files[0]) { setError("Please add at least one photo."); return; }
    setSubmitting(true); setError("");
    try {
      const fd = new FormData();
      fd.append("proof_1", files[0]);
      if (files[1]) fd.append("proof_2", files[1]);
      const res = await fetchWithAuth(
        `${API_URL}/api/orders/orders/${order.id}/mark-complete/`,
        { method: "PATCH", body: fd }
      );
      const data = await res.json();
      if (!res.ok) { setError(data.detail || "Could not mark complete."); return; }
      onSuccess(order.id);
    } catch { setError("Network error. Please try again."); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
      onClick={() => !submitting && onClose()}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl mb-16 sm:mb-0"
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold text-stone-900 text-lg">Proof of Delivery</h3>
          <button onClick={onClose} disabled={submitting} className="p-1 text-stone-400 hover:text-stone-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-stone-500 text-sm mb-5">
          Upload 1–2 photos showing the delivered item. This protects you if a dispute is filed.
        </p>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">{error}</div>
        )}

        <div className="flex gap-3 mb-6">
          {[0, 1].map(idx => (
            <div key={idx} className="flex-1">
              {previews[idx] ? (
                <div className="relative aspect-square rounded-xl overflow-hidden border border-stone-200">
                  <img src={previews[idx]!} alt={`Proof ${idx + 1}`} className="w-full h-full object-cover" />
                  <button
                    onClick={() => remove(idx)}
                    disabled={submitting}
                    className="absolute top-1 right-1 w-6 h-6 bg-black/60 text-white rounded-full flex items-center justify-center"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => [input1, input2][idx].current?.click()}
                  disabled={submitting || (idx === 1 && !files[0])}
                  className="w-full aspect-square rounded-xl border-2 border-dashed border-stone-200 flex flex-col items-center justify-center gap-1.5 text-stone-400 hover:border-teal-400 hover:text-teal-500 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {idx === 0 ? <Camera className="w-6 h-6" /> : <ImagePlus className="w-6 h-6" />}
                  <span className="text-xs font-medium">{idx === 0 ? "Photo 1 *" : "Photo 2"}</span>
                </button>
              )}
              <input ref={[input1, input2][idx]} type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) pick(idx, f); e.target.value = ""; }} />
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} disabled={submitting}
            className="flex-1 py-3 bg-stone-100 text-stone-700 rounded-full font-semibold text-sm disabled:opacity-50">
            Cancel
          </button>
          <button onClick={submit} disabled={submitting || !files[0]}
            className="flex-1 py-3 text-white rounded-full font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: GRAD }}>
            {submitting
              ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Uploading…</>
              : "Mark as Delivered"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [proofOrder, setProofOrder] = useState<any | null>(null);

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

  const handleMarkDelivered = (order: any) => {
    const lt = order.listing?.listing_type;
    if (lt === "product" || lt === "food") {
      setProofOrder(order);
    } else {
      markComplete(order.id);
    }
  };

  if (loading) return <LoadingSpinner />;

  const activeOrders = orders.filter(o => !["completed", "cancelled"].includes(o.status));

  return (
    <div className="pb-4">
      {proofOrder && (
        <ProofModal
          order={proofOrder}
          onSuccess={id => {
            setOrders(prev => prev.map(o => o.id === id ? { ...o, status: "seller_completed" } : o));
            setProofOrder(null);
          }}
          onClose={() => setProofOrder(null)}
        />
      )}

      <div className="mb-5">
        <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-bold mb-0.5">Track</p>
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
                <button
                  onClick={() => handleMarkDelivered(order)}
                  disabled={marking === order.id}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-all active:scale-[0.98]"
                  style={{ background: GRAD }}
                >
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
