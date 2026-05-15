// src/app/admin/transactions/page.tsx
"use client";

import { ArrowUpRight, Search } from "lucide-react";
import { useEffect, useState } from "react";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { fetchWithAuth } from "@/lib/authStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const STATUS_STYLE: Record<string, string> = {
  in_escrow: "bg-amber-100 text-amber-700",
  released:  "bg-teal-100 text-teal-700",
  withdrawn: "bg-stone-100 text-stone-600",
};

const TABS = [
  { label: "All",       value: "" },
  { label: "In Escrow", value: "in_escrow" },
  { label: "Released",  value: "released" },
  { label: "Withdrawn", value: "withdrawn" },
];

export default function AdminTransactionsPage() {
  const [txs, setTxs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("");
  const [search, setSearch] = useState("");
  const [acting, setActing] = useState<number | null>(null);

  const load = (s = search, st = tab) => {
    setLoading(true);
    let url = `${API_URL}/api/admin/service-transactions/?`;
    if (st) url += `status=${st}&`;
    if (s) url += `search=${encodeURIComponent(s)}`;
    fetchWithAuth(url)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setTxs(Array.isArray(d) ? d : (d.results ?? [])))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const updateStatus = async (id: number, newStatus: string) => {
    setActing(id);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/admin/service-transactions/${id}/`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        const updated = await res.json();
        setTxs(prev => prev.map(t => t.id === updated.id ? { ...t, status: updated.status } : t));
      }
    } catch {}
    finally { setActing(null); }
  };

  return (
    <div className="min-h-screen bg-[#FFF8F0]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <AdminTopBar title="Payout Transactions" back="/admin" />

      <div className="px-4 pt-4 pb-28 max-w-2xl mx-auto space-y-3">

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input className="w-full bg-white border border-stone-200 rounded-xl pl-9 pr-4 py-2.5 text-sm placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-teal-400"
            placeholder="Search vendor, order ref…"
            value={search} onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === "Enter" && load(search, tab)} />
        </div>

        <div className="flex gap-2 flex-wrap">
          {TABS.map(t => (
            <button key={t.value}
              onClick={() => { setTab(t.value); load(search, t.value); }}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${tab === t.value ? "bg-teal-600 text-white" : "bg-white border border-stone-200 text-stone-600"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {!loading && <p className="text-xs text-stone-400">{txs.length} transaction{txs.length !== 1 ? "s" : ""}</p>}

        {loading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-white border border-stone-200 rounded-2xl p-4 h-24 animate-pulse" />
            ))}
          </div>
        ) : txs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <ArrowUpRight className="w-10 h-10 text-stone-300" />
            <p className="text-stone-400 text-sm">No payout transactions</p>
          </div>
        ) : (
          <div className="space-y-2">
            {txs.map((t: any) => (
              <div key={t.id} className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-stone-900 text-sm">@{t.vendor}</p>
                      {t.business_name && <p className="text-stone-400 text-xs">{t.business_name}</p>}
                    </div>
                    <p className="text-stone-600 text-sm mt-0.5 font-semibold">₦{Number(t.amount).toLocaleString()}</p>
                    {t.order_reference && <p className="text-stone-400 text-xs mt-0.5">Order {t.order_reference}</p>}
                    <p className="text-stone-400 text-xs mt-0.5">
                      {t.created_at ? new Date(t.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : ""}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${STATUS_STYLE[t.status] || "bg-stone-100 text-stone-600"}`}>
                      {(t.status || "").replace("_", " ")}
                    </span>
                    {t.status === "in_escrow" && (
                      <button onClick={() => updateStatus(t.id, "released")} disabled={acting === t.id}
                        className="text-xs text-teal-600 font-semibold bg-teal-50 border border-teal-200 rounded-lg px-3 py-1.5 disabled:opacity-50">
                        {acting === t.id ? "…" : "Release"}
                      </button>
                    )}
                    {t.status === "released" && (
                      <button onClick={() => updateStatus(t.id, "withdrawn")} disabled={acting === t.id}
                        className="text-xs text-stone-600 font-semibold bg-stone-50 border border-stone-200 rounded-lg px-3 py-1.5 disabled:opacity-50">
                        {acting === t.id ? "…" : "Mark Withdrawn"}
                      </button>
                    )}
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
