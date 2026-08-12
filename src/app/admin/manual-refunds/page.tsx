// src/app/admin/manual-refunds/page.tsx
"use client";

import { Banknote, Search, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import AdminTopBar from "@/components/layout/AdminTopBar";
import CenteredLoader from "@/components/CenteredLoader";
import { useState, useEffect } from "react";
import { fetchAllPages, BASE_URL } from "@/lib/api";

const STATUS_LABELS: Record<string, string> = {
  awaiting_bank_details: "Awaiting Buyer's Bank Details",
  awaiting_admin_action: "Ready to Refund",
  completed: "Refunded",
};
const STATUS_STYLE: Record<string, string> = {
  awaiting_bank_details: "bg-amber-100 text-amber-700",
  awaiting_admin_action: "bg-purple-100 text-purple-700",
  completed: "bg-teal-100 text-teal-700",
};
const STATUS_TABS = ["", "awaiting_bank_details", "awaiting_admin_action", "completed"];

export default function AdminManualRefunds() {
  const router = useRouter();
  const [refunds, setRefunds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const load = (st?: string) => {
    setLoading(true);
    let url = `${BASE_URL}/api/admin/manual-refunds/?`;
    if (st) url += `status=${st}&`;
    fetchAllPages(url)
      .then(d => setRefunds(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleStatus = (st: string) => { setStatusFilter(st); load(st); };

  const filtered = search.trim()
    ? refunds.filter(r => {
        const q = search.toLowerCase();
        return String(r.id).includes(q) ||
          r.order_reference?.toLowerCase().includes(q) ||
          r.buyer_username?.toLowerCase().includes(q) ||
          r.buyer_account_number?.includes(q);
      })
    : refunds;

  const counts: Record<string, number> = {
    "": refunds.length,
    awaiting_bank_details: refunds.filter(r => r.status === "awaiting_bank_details").length,
    awaiting_admin_action: refunds.filter(r => r.status === "awaiting_admin_action").length,
    completed: refunds.filter(r => r.status === "completed").length,
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <AdminTopBar title="Manual Refunds" back="/admin" />

      <div className="px-6 pt-5 pb-28 space-y-4">
        <p className="text-xs text-stone-400 -mt-1">
          Refunds owed on bank-transfer orders — no Paystack transaction exists to refund automatically.
        </p>

        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search order ref, buyer, account number…"
            className="w-full pl-10 pr-4 py-3 bg-white border border-stone-200 rounded-xl text-stone-900 placeholder:text-stone-400 text-sm focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none [&::-webkit-scrollbar]:hidden">
          {[
            { key: "", label: "All" },
            { key: "awaiting_bank_details", label: "Awaiting Details" },
            { key: "awaiting_admin_action", label: "Ready to Refund" },
            { key: "completed", label: "Refunded" },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => handleStatus(t.key)}
              className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 ${
                statusFilter === t.key ? "text-white shadow-sm" : "bg-white border border-stone-200 text-stone-600"
              }`}
              style={statusFilter === t.key ? { background: "#7C3AED" } : {}}
            >
              {t.label} ({counts[t.key] ?? 0})
            </button>
          ))}
        </div>

        {loading ? (
          <CenteredLoader fullScreen={false} />
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-stone-100 rounded-2xl p-10 text-center">
            <Banknote className="w-10 h-10 text-stone-200 mx-auto mb-3" />
            <p className="text-stone-400 text-sm">No manual refunds</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
            {filtered.map(refund => (
              <div
                key={refund.id}
                onClick={() => router.push(`/admin/manual-refunds/${refund.id}`)}
                className="border-b border-stone-100 last:border-0 p-4 hover:bg-stone-50/50 cursor-pointer transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-stone-900 text-sm truncate">
                        {refund.item_title || `Order #${refund.order_reference}`}
                      </p>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 ${STATUS_STYLE[refund.status] || "bg-stone-100 text-stone-500"}`}>
                        {STATUS_LABELS[refund.status] || refund.status}
                      </span>
                    </div>
                    <p className="text-stone-400 text-xs">
                      Buyer: @{refund.buyer_username} · Order #{refund.order_reference}
                    </p>
                    {refund.buyer_account_number && (
                      <p className="text-stone-400 text-xs mt-0.5">
                        {refund.buyer_account_name} · {refund.buyer_account_number} ({refund.buyer_bank_name})
                      </p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-stone-900 text-sm">₦{Number(refund.amount).toLocaleString()}</p>
                    <ChevronRight className="w-4 h-4 text-stone-400 ml-auto mt-1" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
