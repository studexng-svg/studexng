// src/app/admin/manual-refunds/[id]/page.tsx
"use client";

import { Banknote, Package } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { api } from "@/lib/api";
import { GRAD } from "@/lib/tokens";

const STATUS_STYLE: Record<string, string> = {
  awaiting_bank_details: "bg-amber-100 text-amber-700",
  awaiting_admin_action: "bg-purple-100 text-purple-700",
  completed: "bg-teal-100 text-teal-700",
};

function Row({ label, value }: { label: string; value?: string | number | null }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex items-center justify-between py-3 border-b border-stone-100 last:border-0">
      <p className="text-stone-500 text-sm">{label}</p>
      <p className="font-semibold text-stone-900 text-sm">{value}</p>
    </div>
  );
}

export default function AdminManualRefundDetail() {
  const { id } = useParams();
  const router = useRouter();
  const [refund, setRefund] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.admin.manualRefund(id as string)
      .then(async r => { if (r.ok) setRefund(await r.json()); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const markRefunded = async () => {
    if (!refund) return;
    setUpdating(true);
    try {
      const res = await api.admin.updateManualRefund(id as string, { status: "completed" });
      if (res.ok) setRefund(await res.json());
    } catch {}
    finally { setUpdating(false); }
  };

  if (loading) return (
    <div className="min-h-screen bg-[#F5F5F5] flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-stone-200 border-t-purple-500 rounded-full animate-spin" />
    </div>
  );

  if (!refund) return (
    <div className="min-h-screen bg-[#F5F5F5] flex flex-col items-center justify-center gap-4">
      <Banknote className="w-12 h-12 text-stone-300" />
      <p className="text-stone-500">Refund not found</p>
      <button onClick={() => router.back()} className="px-5 py-2.5 bg-white border border-stone-200 rounded-full text-sm font-semibold">
        Go back
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <AdminTopBar title={`Refund #${refund.id}`} back="/admin/manual-refunds" />

      <div className="px-6 pt-5 pb-28 space-y-4">

        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <p className="text-stone-600 text-sm font-medium">Status</p>
          <span className={`px-3 py-1 rounded-full text-xs font-bold ${STATUS_STYLE[refund.status] || "bg-stone-100 text-stone-600"}`}>
            {refund.status.replace(/_/g, " ")}
          </span>
        </div>

        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
          <p className="text-purple-600 text-xs tracking-[0.2em] uppercase font-semibold mb-2 flex items-center gap-2">
            <Package className="w-3.5 h-3.5" /> Refund Details
          </p>
          <Row label="Amount" value={`₦${Number(refund.amount).toLocaleString()}`} />
          <Row label="Order" value={`#${refund.order_reference}`} />
          <Row label="Buyer" value={`@${refund.buyer_username}`} />
          <Row label="Item" value={refund.item_title} />
          <Row label="Reason" value={refund.reason} />
          <Row label="Requested" value={new Date(refund.created_at).toLocaleString("en-NG", {
            day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
          })} />
        </div>

        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
          <p className="text-purple-600 text-xs tracking-[0.2em] uppercase font-semibold mb-2 flex items-center gap-2">
            <Banknote className="w-3.5 h-3.5" /> Buyer's Bank Details
          </p>
          {refund.buyer_account_number ? (
            <>
              <Row label="Account Name" value={refund.buyer_account_name} />
              <Row label="Account Number" value={refund.buyer_account_number} />
              <Row label="Bank" value={refund.buyer_bank_name} />
            </>
          ) : (
            <p className="text-stone-400 text-sm py-2">Waiting for the buyer to submit their bank details.</p>
          )}
        </div>

        {refund.status === "awaiting_admin_action" && (
          <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm space-y-2">
            <p className="text-teal-600 text-xs tracking-[0.2em] uppercase font-semibold mb-3">Admin Action</p>
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 mb-2">
              <p className="text-purple-700 text-xs font-medium leading-relaxed">
                Send ₦{Number(refund.amount).toLocaleString()} to {refund.buyer_account_name} ({refund.buyer_account_number},
                {" "}{refund.buyer_bank_name}) yourself, then confirm below — this notifies the buyer their refund was sent.
              </p>
            </div>
            <button onClick={markRefunded} disabled={updating}
              className="w-full py-3 text-white font-semibold rounded-xl text-sm disabled:opacity-50 transition"
              style={{ background: GRAD }}>
              {updating ? "Marking…" : "Mark as Refunded"}
            </button>
          </div>
        )}

        {refund.status === "completed" && refund.resolved_at && (
          <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4">
            <p className="text-teal-700 text-sm font-medium">
              Refunded on {new Date(refund.resolved_at).toLocaleString("en-NG", {
                day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
              })}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
