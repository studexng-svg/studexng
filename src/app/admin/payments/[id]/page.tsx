// src/app/admin/payments/[id]/page.tsx
"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DollarSign } from "lucide-react";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { fetchWithAuth } from "@/lib/authStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

function Row({ label, value }: { label: string; value?: string | number | null }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex justify-between py-3 border-b border-stone-100 last:border-0 gap-4">
      <p className="text-stone-500 text-sm flex-shrink-0">{label}</p>
      <p className="font-semibold text-stone-900 text-sm text-right break-all">{value}</p>
    </div>
  );
}

const STATUS_STYLE: Record<string, string> = {
  success:  "bg-teal-100 text-teal-700",
  pending:  "bg-amber-100 text-amber-700",
  failed:   "bg-red-100 text-red-700",
  refunded: "bg-purple-100 text-purple-700",
};

export default function AdminPaymentDetail() {
  const { id } = useParams();
  const router = useRouter();
  const [payment, setPayment] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetchWithAuth(`${API_URL}/api/admin/payments/${id}/`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setPayment(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div className="min-h-screen bg-[#FFF8F0] flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-stone-200 border-t-teal-500 rounded-full animate-spin" />
    </div>
  );
  if (!payment) return (
    <div className="min-h-screen bg-[#FFF8F0] flex flex-col items-center justify-center gap-4">
      <DollarSign className="w-12 h-12 text-stone-300" />
      <p className="text-stone-500">Payment not found</p>
      <button onClick={() => router.back()} className="px-5 py-2.5 bg-white border border-stone-200 rounded-full text-sm font-semibold">Go back</button>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FFF8F0]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <AdminTopBar title={`Payment #${payment.id}`} back="/admin/payments" />

      <div className="px-4 pt-5 pb-28 max-w-2xl mx-auto space-y-4">

        {/* Status */}
        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <p className="text-stone-600 text-sm font-medium">Status</p>
          <span className={`px-3 py-1 rounded-full text-xs font-bold ${STATUS_STYLE[payment.status] || "bg-stone-100 text-stone-600"}`}>
            {payment.status}
          </span>
        </div>

        {/* Amounts */}
        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
          <p className="text-teal-600 text-xs tracking-[0.2em] uppercase font-semibold mb-2">Amounts</p>
          <Row label="Buyer Paid"      value={`₦${Number(payment.amount).toLocaleString()}`} />
          <Row label="Seller Gets"     value={`₦${Number(payment.seller_amount).toLocaleString()}`} />
          <Row label="Service Charge"  value={`₦${Number(payment.service_charge).toLocaleString()}`} />
          <Row label="Discount"        value={Number(payment.discount_amount) > 0 ? `-₦${Number(payment.discount_amount).toLocaleString()}` : null} />
          <Row label="Platform Revenue" value={`₦${Number(payment.platform_amount).toLocaleString()}`} />
        </div>

        {/* Parties */}
        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
          <p className="text-teal-600 text-xs tracking-[0.2em] uppercase font-semibold mb-2">Parties</p>
          <Row label="Buyer"       value={payment.buyer ? `@${payment.buyer}` : payment.buyer_email} />
          <Row label="Buyer Email" value={payment.buyer_email} />
          <Row label="Seller"      value={payment.seller ? `@${payment.seller}` : "—"} />
          <Row label="Order Type"  value={payment.order_type} />
          <Row label="Order ID"    value={payment.order_id ? `#${payment.order_id}` : null} />
        </div>

        {/* References */}
        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
          <p className="text-teal-600 text-xs tracking-[0.2em] uppercase font-semibold mb-2">References</p>
          <Row label="Reference"         value={payment.reference} />
          <Row label="Paystack TX ID"    value={payment.paystack_transaction_id} />
          <Row label="Transfer Ref"      value={payment.transfer_reference} />
          <Row label="Transfer Status"   value={payment.transfer_status} />
          <Row label="Date"              value={payment.created_at ? new Date(payment.created_at).toLocaleString("en-NG") : null} />
        </div>
      </div>
    </div>
  );
}
