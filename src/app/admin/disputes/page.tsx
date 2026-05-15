// src/app/admin/disputes/page.tsx
"use client";

import { AlertTriangle, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { fetchAllPages } from "@/lib/authStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const STATUS_STYLE: Record<string, string> = {
  open:         "bg-red-100 text-red-700",
  under_review: "bg-amber-100 text-amber-700",
  resolved:     "bg-teal-100 text-teal-700",
  appealed:     "bg-purple-100 text-purple-700",
  closed:       "bg-stone-100 text-stone-500",
};

const TABS = [
  { label: "All",      value: "" },
  { label: "Open",     value: "open" },
  { label: "Review",   value: "under_review" },
  { label: "Resolved", value: "resolved" },
];

export default function AdminDisputesPage() {
  const router = useRouter();
  const [disputes, setDisputes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("");
  const [search, setSearch] = useState("");

  const load = (s = search, st = tab) => {
    setLoading(true);
    let url = `${API_URL}/api/admin/disputes/?`;
    if (st) url += `status=${st}&`;
    if (s) url += `search=${encodeURIComponent(s)}`;
    fetchAllPages(url)
      .then(d => setDisputes(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="min-h-screen bg-[#FFF8F0]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <AdminTopBar title="Disputes" back="/admin" />

      <div className="px-4 pt-4 pb-28 max-w-2xl mx-auto space-y-3">

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input className="w-full bg-white border border-stone-200 rounded-xl pl-9 pr-4 py-2.5 text-sm placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-teal-400"
            placeholder="Search order ref, username…"
            value={search} onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === "Enter" && load(search, tab)} />
        </div>

        <div className="flex gap-2 flex-wrap">
          {TABS.map(t => (
            <button key={t.value}
              onClick={() => { setTab(t.value); load(search, t.value); }}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition ${tab === t.value ? "bg-teal-600 text-white" : "bg-white border border-stone-200 text-stone-600"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {!loading && <p className="text-xs text-stone-400">{disputes.length} dispute{disputes.length !== 1 ? "s" : ""}</p>}

        {loading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white border border-stone-200 rounded-2xl p-4 h-20 animate-pulse" />
            ))}
          </div>
        ) : disputes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <AlertTriangle className="w-10 h-10 text-stone-300" />
            <p className="text-stone-400 text-sm">No disputes found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {disputes.map((d: any) => (
              <button key={d.id} onClick={() => router.push(`/admin/disputes/${d.id}`)}
                className="w-full bg-white border border-stone-200 hover:border-teal-300 rounded-2xl p-4 text-left transition active:scale-[0.98]">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-stone-900 text-sm">Dispute #{d.id}</p>
                    <p className="text-stone-500 text-xs mt-0.5">
                      Order {d.order_reference} · {d.filed_by === "customer" ? "Customer" : "Provider"} filed · {(d.reason || "").replace(/_/g, " ")}
                    </p>
                    <p className="text-stone-400 text-xs mt-0.5">by @{d.filer_username}</p>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold flex-shrink-0 ${STATUS_STYLE[d.status] || "bg-stone-100 text-stone-600"}`}>
                    {(d.status || "").replace("_", " ")}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
