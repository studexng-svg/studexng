// src/app/admin/payments/page.tsx
"use client";

import { DollarSign, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { fetchAllPages } from "@/lib/authStore";
import { CampusPills, type Campus } from "@/components/admin/CampusPills";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const STATUS_STYLE: Record<string, string> = {
  success:  "bg-teal-100 text-teal-700",
  pending:  "bg-amber-100 text-amber-700",
  failed:   "bg-red-100 text-red-700",
  refunded: "bg-purple-100 text-purple-700",
};

const TABS = [
  { label: "All",      value: "" },
  { label: "Success",  value: "success" },
  { label: "Pending",  value: "pending" },
  { label: "Failed",   value: "failed" },
  { label: "Refunded", value: "refunded" },
];

export default function AdminPaymentsPage() {
  const router = useRouter();
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("");
  const [search, setSearch] = useState("");
  const [campus, setCampus] = useState<Campus>("");

  const load = (s = search, st = tab, c = campus) => {
    setLoading(true);
    let url = `${API_URL}/api/admin/payments/?`;
    if (st) url += `status=${st}&`;
    if (s) url += `search=${encodeURIComponent(s)}&`;
    if (c) url += `campus=${c}`;
    fetchAllPages(url)
      .then(d => setPayments(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="min-h-screen bg-[#FFF8F0]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <AdminTopBar title="Payments" back="/admin" />

      <div className="px-4 pt-4 pb-28 max-w-2xl mx-auto space-y-3">

        <CampusPills value={campus} onChange={c => { setCampus(c); load(search, tab, c); }} />

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input className="w-full bg-white border border-stone-200 rounded-xl pl-9 pr-4 py-2.5 text-sm placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-teal-400"
            placeholder="Search reference, buyer, seller…"
            value={search} onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === "Enter" && load(search, tab, campus)} />
        </div>

        <div className="flex gap-2 flex-wrap">
          {TABS.map(t => (
            <button key={t.value}
              onClick={() => { setTab(t.value); load(search, t.value, campus); }}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${tab === t.value ? "bg-teal-600 text-white" : "bg-white border border-stone-200 text-stone-600"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {!loading && <p className="text-xs text-stone-400">{payments.length} transaction{payments.length !== 1 ? "s" : ""}</p>}

        {loading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-white border border-stone-200 rounded-2xl p-4 h-24 animate-pulse" />
            ))}
          </div>
        ) : payments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <DollarSign className="w-10 h-10 text-stone-300" />
            <p className="text-stone-400 text-sm">No payments found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {payments.map((p: any) => (
              <button key={p.id} onClick={() => router.push(`/admin/payments/${p.id}`)}
                className="w-full bg-white border border-stone-200 hover:border-teal-300 rounded-2xl p-4 text-left transition active:scale-[0.98]">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-stone-900 text-sm font-mono truncate">{p.reference}</p>
                    <p className="text-stone-500 text-xs mt-0.5">
                      @{p.buyer} → @{p.seller} · ₦{Number(p.amount).toLocaleString()}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-stone-400 text-xs">Seller: ₦{Number(p.seller_amount).toLocaleString()}</span>
                      <span className="text-stone-300 text-xs">·</span>
                      <span className="text-stone-400 text-xs">Platform: ₦{Number(p.platform_amount).toLocaleString()}</span>
                    </div>
                    {p.transfer_status && (
                      <p className="text-xs text-purple-600 mt-0.5">Transfer: {p.transfer_status}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${STATUS_STYLE[p.status] || "bg-stone-100 text-stone-600"}`}>
                      {p.status}
                    </span>
                    <span className="text-xs text-stone-400">{p.order_type}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
