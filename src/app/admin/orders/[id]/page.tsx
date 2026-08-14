// src/app/admin/orders/[id]/page.tsx
"use client";

import { Package, Clock, Truck, MapPin, User } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { api } from "@/lib/api";
import { GRAD } from "@/lib/tokens";

const STATUS_STYLE: Record<string, string> = {
  pending:                "bg-amber-100 text-amber-700",
  pending_bank_transfer:  "bg-purple-100 text-purple-700",
  paid:                   "bg-amber-100 text-amber-700",
  seller_completed:       "bg-blue-100 text-blue-700",
  completed:              "bg-teal-100 text-teal-700",
  cancelled:              "bg-stone-100 text-stone-500",
  disputed:               "bg-red-100 text-red-700",
};


function useElapsed(isoDate: string | null | undefined) {
  const [elapsed, setElapsed] = useState("");
  useEffect(() => {
    if (!isoDate) return;
    const update = () => {
      const secs = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
      if (secs < 60) { setElapsed(`${secs}s ago`); return; }
      const mins = Math.floor(secs / 60);
      if (mins < 60) { setElapsed(`${mins}m ago`); return; }
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) { setElapsed(`${hrs}h ${mins % 60}m ago`); return; }
      const days = Math.floor(hrs / 24);
      setElapsed(`${days}d ${hrs % 24}h ago`);
    };
    update();
    const t = setInterval(update, 30_000);
    return () => clearInterval(t);
  }, [isoDate]);
  return elapsed;
}

function Row({ label, value }: { label: string; value?: string | number | null }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex items-center justify-between py-3 border-b border-stone-100 last:border-0">
      <p className="text-stone-500 text-sm">{label}</p>
      <p className="font-semibold text-stone-900 text-sm">{value}</p>
    </div>
  );
}

export default function AdminOrderDetail() {
  const { id } = useParams();
  const router = useRouter();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [delivery, setDelivery] = useState<any>(null);
  const [riders, setRiders] = useState<any[]>([]);
  const [pickupPoints, setPickupPoints] = useState<any[]>([]);
  const [selectedRider, setSelectedRider] = useState("");
  const [selectedPoint, setSelectedPoint] = useState("");
  const [assigning, setAssigning] = useState(false);
  const sellerCompletedElapsed = useElapsed(order?.seller_completed_at);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setLoading(true);
      try {
        const [orderRes, ridersRes, pointsRes] = await Promise.all([
          api.admin.order(id as string),
          api.admin.riders(),
          api.admin.pickupPoints(),
        ]);
        if (orderRes.ok) {
          const o = await orderRes.json();
          setOrder(o);
          // fetch delivery assignment separately — won't 404 the whole page
          try {
            const delivRes = await api.admin.deliveries();
            if (delivRes.ok) {
              const all = await delivRes.json();
              const match = (Array.isArray(all) ? all : []).find((d: any) => d.order_id === o.id);
              if (match) setDelivery(match);
            }
          } catch {}
        }
        if (ridersRes.ok) setRiders(await ridersRes.json());
        if (pointsRes.ok) {
          const pts = await pointsRes.json();
          setPickupPoints(Array.isArray(pts) ? pts : []);
        }
      } catch {}
      finally { setLoading(false); }
    };
    load();
  }, [id]);

  const assignRider = async () => {
    if (!selectedRider) return;
    setAssigning(true);
    try {
      // pickup_point_id is optional (delivery.views.AdminAssignRiderView) —
      // leave it out entirely for orders that should drop off at the
      // buyer's own delivery_location instead of a shared campus hub.
      // Picking one here used to be mandatory, which is why deliveries kept
      // showing a pickup point's name as "Drop-off" instead of the address
      // the buyer actually typed at checkout.
      const res = await api.admin.assignRider(id as string, {
        rider_id: Number(selectedRider),
        ...(selectedPoint ? { pickup_point_id: Number(selectedPoint) } : {}),
      });
      if (res.ok) setDelivery(await res.json());
    } catch {}
    setAssigning(false);
  };

  const updateStatus = async (newStatus: string) => {
    if (!order) return;
    setUpdating(true);
    try {
      const res = await api.admin.updateOrder(id as string, { status: newStatus });
      if (res.ok) setOrder(await res.json());
    } catch {}
    finally { setUpdating(false); }
  };

  if (loading) return (
    <div className="min-h-screen bg-[#F5F5F5] flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-stone-200 border-t-teal-500 rounded-full animate-spin" />
    </div>
  );

  if (!order) return (
    <div className="min-h-screen bg-[#F5F5F5] flex flex-col items-center justify-center gap-4">
      <Package className="w-12 h-12 text-stone-300" />
      <p className="text-stone-500">Order not found</p>
      <button onClick={() => router.back()} className="px-5 py-2.5 bg-white border border-stone-200 rounded-full text-sm font-semibold">
        Go back
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <AdminTopBar title={`Order #${order.id}`} back="/admin/orders" />

      <div className="px-6 pt-5 pb-28 space-y-4">

        {/* Status */}
        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <p className="text-stone-600 text-sm font-medium">Escrow Status</p>
          <span className={`px-3 py-1 rounded-full text-xs font-bold ${STATUS_STYLE[order.status] || "bg-stone-100 text-stone-600"}`}>
            {order.status?.charAt(0).toUpperCase() + order.status?.slice(1).replace("_", " ")}
          </span>
        </div>

        {/* Details */}
        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
          <p className="text-teal-600 text-xs tracking-[0.2em] uppercase font-semibold mb-2">Order Details</p>
          <Row label="Order ID"   value={`#${order.id}`} />
          <Row label="Reference"  value={order.reference} />
          <Row label="Listing"    value={order.listing?.title} />
          <Row label="Buyer"      value={typeof order.buyer === 'string' ? order.buyer : order.buyer?.username} />
          <Row label="Vendor"     value={order.listing?.vendor?.username} />
          <Row label="Amount"           value={order.amount ? `₦${Number(order.amount).toLocaleString()}` : undefined} />
          <Row label="Delivery Location" value={order.delivery_location || "Not set"} />
          <Row label="Date"             value={order.created_at ? new Date(order.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : undefined} />
        </div>

        {/* Payment Breakdown — buyer paid vs. vendor payout vs. StudEx's cut,
             from the matching PaymentTransaction (accounts.admin_views.
             AdminOrderDetailView). Absent for orders with no linked
             transaction (pre-payment, or a payment record that never landed). */}
        {order.buyer_paid && (
          <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
            <p className="text-teal-600 text-xs tracking-[0.2em] uppercase font-semibold mb-2">Payment Breakdown</p>
            <Row label="Buyer Paid"    value={`₦${Number(order.buyer_paid).toLocaleString()}`} />
            <Row label="Vendor Gets"   value={`₦${Number(order.vendor_gets).toLocaleString()}`} />
            <Row label="StudEx Fee"    value={`₦${Number(order.platform_fee).toLocaleString()}`} />
            <Row label="Payment Status" value={order.payment_status} />
            {order.vendor_payout_status && <Row label="Vendor Payout" value={order.vendor_payout_status} />}
          </div>
        )}

        {/* Delivery Proof */}
        {(order.delivery_proof_1 || order.delivery_proof_2) && (
          <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
            <p className="text-teal-600 text-xs tracking-[0.2em] uppercase font-semibold mb-3">Delivery Proof</p>
            <div className="flex gap-3">
              {[order.delivery_proof_1, order.delivery_proof_2].filter(Boolean).map((url: string, i: number) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                  className="flex-1 max-w-[160px] aspect-square rounded-xl overflow-hidden border border-stone-200 block hover:opacity-90 transition">
                  <img src={url} alt={`Proof ${i + 1}`} className="w-full h-full object-cover" />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Bank Transfer Payment Proof — buyer-uploaded screenshot from checkout
             (payments.initiate_bank_transfer_cart), optional, so this only
             ever renders when one was actually attached. */}
        {order.bank_transfer_proof && (
          <div className="bg-white border border-purple-200 rounded-2xl p-4 shadow-sm">
            <p className="text-purple-600 text-xs tracking-[0.2em] uppercase font-semibold mb-3">Payment Proof</p>
            <a href={order.bank_transfer_proof} target="_blank" rel="noopener noreferrer"
              className="block max-w-[200px] rounded-xl overflow-hidden border border-stone-200 hover:opacity-90 transition">
              <img src={order.bank_transfer_proof} alt="Bank transfer proof" className="w-full h-auto object-cover" />
            </a>
          </div>
        )}

        {/* Delivery Assignment */}
        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Truck className="w-4 h-4 text-teal-600" />
            <p className="text-teal-600 text-xs tracking-[0.2em] uppercase font-semibold">Delivery</p>
          </div>

          {delivery ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <User className="w-3.5 h-3.5 text-stone-400" />
                <span className="text-stone-500">Rider:</span>
                <span className="font-semibold text-stone-900">@{delivery.rider_username}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="w-3.5 h-3.5 text-teal-500" />
                <span className="text-stone-500">Drop-off:</span>
                <span className="font-semibold text-stone-900">
                  {delivery.pickup_point_name ? `${delivery.pickup_point_name} · ${delivery.pickup_point_campus}` : (delivery.delivery_location || order.delivery_location || "Not set")}
                </span>
              </div>
              <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold mt-1 ${
                delivery.status === "assigned" ? "bg-amber-100 text-amber-700"
                : delivery.status === "picked_up" ? "bg-blue-100 text-blue-700"
                : delivery.status === "at_pickup_point" ? "bg-teal-100 text-teal-700"
                : "bg-stone-100 text-stone-600"
              }`}>
                {{assigned:"Assigned",picked_up:"Picked Up",at_pickup_point:"At Pickup Point",completed:"Completed"}[delivery.status as string] || delivery.status}
              </span>
              <p className="text-xs text-stone-400 mt-1">Reassign below if needed.</p>
            </div>
          ) : (
            <p className="text-stone-400 text-sm">No rider assigned yet.</p>
          )}

          {/* Assign form */}
          {riders.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-stone-100">
              <select
                value={selectedRider}
                onChange={e => setSelectedRider(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-stone-200 text-sm text-stone-900 bg-white focus:outline-none focus:border-teal-500"
              >
                <option value="">Select rider…</option>
                {riders.map((r: any) => (
                  <option key={r.id} value={r.id}>@{r.username}{r.school ? ` (${r.school})` : ""}</option>
                ))}
              </select>
              <select
                value={selectedPoint}
                onChange={e => setSelectedPoint(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-stone-200 text-sm text-stone-900 bg-white focus:outline-none focus:border-teal-500"
              >
                <option value="">No pickup point — deliver to buyer&apos;s address</option>
                {pickupPoints.filter((p: any) => p.is_active).map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name} · {p.campus}</option>
                ))}
              </select>
              <p className="text-xs text-stone-400 -mt-1">
                Only pick a point for orders that hand off at a shared campus hub — otherwise the rider
                sees &ldquo;{order.delivery_location || "the buyer's typed address"}&rdquo; as the drop-off.
              </p>
              <button
                onClick={assignRider}
                disabled={assigning || !selectedRider}
                className="w-full py-3 rounded-xl text-white text-sm font-semibold disabled:opacity-50 transition"
                style={{ background: "#0d9488" }}
              >
                {assigning ? "Assigning…" : delivery ? "Reassign Rider" : "Assign Rider"}
              </button>
            </div>
          )}
        </div>

        {/* Bank Transfer Confirmation (temporary manual-settlement path) */}
        {order.status === "pending_bank_transfer" && (
          <div className="bg-white border border-purple-200 rounded-2xl p-4 shadow-sm space-y-2">
            <p className="text-purple-600 text-xs tracking-[0.2em] uppercase font-semibold mb-1">Bank Transfer Confirmation</p>
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 mb-2">
              <p className="text-purple-700 text-xs font-medium leading-relaxed">
                Buyer says they've transferred <strong>₦{order.amount ? Number(order.amount).toLocaleString() : "?"}</strong> to
                your bank account. Check your account, then confirm or reject below — the vendor is
                only notified and a rider only assigned once you confirm.
              </p>
            </div>
            <button onClick={() => updateStatus("paid")} disabled={updating}
              className="w-full py-3 text-white font-semibold rounded-xl text-sm disabled:opacity-50 transition"
              style={{ background: GRAD }}>
              {updating ? "Confirming…" : "Confirm Payment Received"}
            </button>
            <button onClick={() => updateStatus("cancelled")} disabled={updating}
              className="w-full py-3 bg-red-100 text-red-700 font-semibold rounded-xl text-sm disabled:opacity-50 transition hover:bg-red-200">
              {updating ? "Updating…" : "Reject — Transfer Not Received"}
            </button>
          </div>
        )}

        {/* Admin Actions */}
        {(order.status === "pending" || order.status === "paid" || order.status === "seller_completed") && (
          <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm space-y-2">
            <p className="text-teal-600 text-xs tracking-[0.2em] uppercase font-semibold mb-3">Admin Actions</p>

            {order.status === "seller_completed" && (
              <>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-2 space-y-2">
                  <p className="text-amber-700 text-xs font-medium">
                    Vendor has marked this order complete but the buyer hasn&apos;t confirmed yet.
                    Confirming here will immediately trigger the vendor payout via Transfer API.
                  </p>
                  {order.seller_completed_at && (
                    <div className="flex items-center gap-1.5 pt-1 border-t border-amber-200">
                      <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <p className="text-amber-600 text-xs">
                        Marked delivered on{" "}
                        <span className="font-semibold">
                          {new Date(order.seller_completed_at).toLocaleString("en-NG", {
                            day: "numeric", month: "short", year: "numeric",
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </span>
                        {sellerCompletedElapsed && (
                          <span className="ml-1 text-amber-500">({sellerCompletedElapsed})</span>
                        )}
                      </p>
                    </div>
                  )}
                </div>
                <button onClick={() => updateStatus("completed")} disabled={updating}
                  className="w-full py-3 text-white font-semibold rounded-xl text-sm disabled:opacity-50 transition"
                  style={{ background: GRAD }}>
                  {updating ? "Processing…" : "Confirm Delivery & Release Payment"}
                </button>
              </>
            )}

            {(order.status === "pending" || order.status === "paid") && (
              <button onClick={() => updateStatus("completed")} disabled={updating}
                className="w-full py-3 text-white font-semibold rounded-xl text-sm disabled:opacity-50 transition"
                style={{ background: GRAD }}>
                {updating ? "Updating…" : "Mark as Completed"}
              </button>
            )}

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
