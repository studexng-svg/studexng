"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { TEAL, toArray } from "@/lib/tokens";
import { ShoppingBag, MapPin, Camera, X, ImagePlus, Clock, MessageCircle, CheckCircle2, XCircle, Play } from "lucide-react";
import { StatusBadge, EmptyState, LoadingSpinner, HEADING_FONT } from "../_shared";
import { api } from "@/lib/api";

const MARK_COMPLETE_WAIT_SECS = 15 * 60;

function getCountdown(paidAt: string | null | undefined): { canMark: boolean; label: string } {
  if (!paidAt) return { canMark: true, label: "" };
  const elapsed = Math.floor((Date.now() - new Date(paidAt).getTime()) / 1000);
  const remaining = Math.max(0, MARK_COMPLETE_WAIT_SECS - elapsed);
  if (remaining === 0) return { canMark: true, label: "" };
  const m = String(Math.floor(remaining / 60)).padStart(2, "0");
  const s = String(remaining % 60).padStart(2, "0");
  return { canMark: false, label: `${m}:${s}` };
}

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
      const res = await api.orders.markComplete(order.id, fd);
      const data = await res.json();
      if (!res.ok) { setError(data.detail || "Could not mark complete."); return; }
      onSuccess(order.id);
    } catch { setError("Network error. Please try again."); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={() => !submitting && onClose()}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl"
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
            style={{ background: TEAL }}>
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
  const queryClient = useQueryClient();
  const router = useRouter();
  const [error, setError] = useState("");
  const [proofOrder, setProofOrder] = useState<any | null>(null);
  const [tick, setTick] = useState(0);
  const [chatLoading, setChatLoading] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [markingItem, setMarkingItem] = useState<number | null>(null);

  const handleMarkUnavailable = async (order: any, itemId: number) => {
    if (!confirm("Mark this item unavailable? The buyer will be refunded for it automatically.")) return;
    setMarkingItem(itemId);
    setError("");
    try {
      const res = await api.orders.markItemUnavailable(order.id, itemId);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.detail || "Could not mark item unavailable."); return; }
      queryClient.setQueryData<any[]>(["vendor-orders"], prev =>
        prev ? prev.map(o => o.id === order.id
          ? { ...o, items: (o.items || []).map((it: any) => it.id === itemId ? { ...it, status: "unavailable" } : it) }
          : o
        ) : prev
      );
    } catch { setError("Network error. Please try again."); }
    finally { setMarkingItem(null); }
  };

  const runOrderAction = async (
    order: any,
    action: (id: number | string) => Promise<Response>,
    patch: Record<string, unknown>,
  ) => {
    setActionLoading(order.id);
    setError("");
    try {
      const res = await action(order.id);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.detail || "Action failed. Please try again."); return; }
      queryClient.setQueryData<any[]>(["vendor-orders"], prev =>
        prev ? prev.map(o => o.id === order.id ? { ...o, ...patch } : o) : prev
      );
    } catch { setError("Network error. Please try again."); }
    finally { setActionLoading(null); }
  };

  const handleVendorAccept = (order: any) =>
    runOrderAction(order, api.orders.vendorAccept, { vendor_accepted_at: new Date().toISOString() });

  const handleVendorDecline = (order: any) => {
    if (!confirm("Decline this order? The buyer will be fully refunded immediately.")) return;
    return runOrderAction(order, api.orders.vendorDecline, { status: "vendor_declined" });
  };

  const handleStartService = (order: any) =>
    runOrderAction(order, api.orders.startService, { service_started_at: new Date().toISOString() });

  const handleMessageBuyer = async (order: any) => {
    setChatLoading(order.id);
    try {
      const res = await api.chat.forOrder(order.id);
      const conv = await res.json();
      router.push(`/chat/${conv.id}`);
    } catch {} finally { setChatLoading(null); }
  };

  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const { data: ordersData, isPending: loading } = useQuery({
    queryKey: ["vendor-orders"],
    queryFn: async () => {
      const res = await api.orders.list();
      const data = await res.json();
      return toArray(data);
    },
    staleTime: 30_000,
  });

  const orders: any[] = ordersData ?? [];

  if (loading) return <LoadingSpinner />;

  const activeOrders = orders.filter(o => !["completed", "cancelled", "vendor_declined"].includes(o.status));

  return (
    <div className="pb-4">
      {proofOrder && (
        <ProofModal
          order={proofOrder}
          onSuccess={id => {
            queryClient.setQueryData<any[]>(["vendor-orders"], prev =>
              prev ? prev.map(o => o.id === id ? { ...o, status: "seller_completed" } : o) : prev
            );
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
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 bg-stone-100">
                    {(order.items?.find((it: any) => it.image)?.image || order.listing?.image) ? (
                      <img src={order.items?.find((it: any) => it.image)?.image || order.listing?.image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ShoppingBag className="w-4 h-4 text-stone-300" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-stone-900 text-sm truncate">{order.listing?.title}</p>
                    <p className="text-xs text-stone-400">#{order.reference}</p>
                  </div>
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

              {!!order.items?.length && !["completed", "cancelled", "vendor_declined"].includes(order.status) && (
                <div className="mb-3 space-y-1.5">
                  {order.items.map((item: any) => (
                    <div key={item.id} className="flex items-center justify-between gap-2 bg-stone-50 rounded-xl px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 bg-stone-200">
                          {item.image ? (
                            <img src={item.image} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <ShoppingBag className="w-3.5 h-3.5 text-stone-400" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className={`text-xs font-medium ${item.status === "unavailable" ? "text-stone-400 line-through" : "text-stone-700"}`}>
                            {item.listing_title} × {item.quantity}
                          </p>
                          {item.addons?.length > 0 && (
                            <p className="text-[11px] text-stone-400 truncate">{item.addons.map((a: any) => a.quantity > 1 ? `${a.name} ×${a.quantity}` : a.name).join(", ")}</p>
                          )}
                        </div>
                      </div>
                      {item.status === "fulfilled" ? (
                        <button
                          onClick={() => handleMarkUnavailable(order, item.id)}
                          disabled={markingItem === item.id}
                          className="text-[11px] font-semibold text-red-500 bg-red-50 px-2.5 py-1 rounded-full flex-shrink-0 disabled:opacity-50 hover:bg-red-100 transition"
                        >
                          {markingItem === item.id ? "…" : "Mark Unavailable"}
                        </button>
                      ) : (
                        <span className="text-[11px] font-semibold text-red-500 flex-shrink-0">Refunded</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {order.status === "paid" && !order.vendor_accepted_at && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleVendorAccept(order)}
                    disabled={actionLoading === order.id}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
                    style={{ background: TEAL }}
                  >
                    <CheckCircle2 className="w-4 h-4" /> Accept
                  </button>
                  <button
                    onClick={() => handleVendorDecline(order)}
                    disabled={actionLoading === order.id}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-red-600 bg-red-50 border border-red-200 flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50 hover:bg-red-100"
                  >
                    <XCircle className="w-4 h-4" /> Decline
                  </button>
                </div>
              )}
              {order.status === "paid" && order.vendor_accepted_at && !order.service_started_at && (
                <button
                  onClick={() => handleStartService(order)}
                  disabled={actionLoading === order.id}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
                  style={{ background: TEAL }}
                >
                  <Play className="w-4 h-4" /> Start Service
                </button>
              )}
              {order.status === "paid" && order.vendor_accepted_at && order.service_started_at && (() => {
                void tick;
                const { canMark, label } = getCountdown(order.paid_at);
                return (
                  <button
                    onClick={() => canMark && setProofOrder(order)}
                    disabled={!canMark}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: TEAL }}
                  >
                    {!canMark && <Clock className="w-4 h-4" />}
                    {canMark ? "Mark as Delivered" : `Mark as Delivered (${label})`}
                  </button>
                );
              })()}
              {order.status === "seller_completed" && (
                <div className="w-full py-2.5 rounded-xl text-sm font-semibold text-center bg-teal-50 text-teal-700 border border-teal-100">
                  Waiting for buyer to confirm
                </div>
              )}
              <button
                onClick={() => handleMessageBuyer(order)}
                disabled={chatLoading === order.id}
                className="w-full mt-3 py-2.5 bg-white border border-teal-300 text-teal-700 disabled:opacity-50 rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2 hover:bg-teal-50 active:scale-[0.98]"
              >
                {chatLoading === order.id
                  ? <div className="w-4 h-4 border-2 border-teal-400/40 border-t-teal-600 rounded-full animate-spin" />
                  : <MessageCircle className="w-4 h-4" />}
                Message Buyer
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
