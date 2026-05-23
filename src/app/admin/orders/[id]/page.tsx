// src/app/admin/orders/[id]/page.tsx
"use client";

import { Package, Clock } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
  const sellerCompletedElapsed = useElapsed(order?.seller_completed_at);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setLoading(true);
      try {
        const orderRes = await fetchWithAuth(`${API_URL}/api/admin/orders/${id}/`);
        if (orderRes.ok) setOrder(await orderRes.json());
      } catch {}
      finally { setLoading(false); }
    };
    load();
  }, [id]);

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

      <div className="px-4 pt-5 pb-28 max-w-2xl mx-auto space-y-4">

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
          <Row label="Buyer"      value={order.buyer?.username} />
          <Row label="Vendor"     value={order.listing?.vendor?.username} />
          <Row label="Amount"     value={order.amount ? `₦${Number(order.amount).toLocaleString()}` : undefined} />
          <Row label="Date"       value={order.created_at ? new Date(order.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : undefined} />
        </div>

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
