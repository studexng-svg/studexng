// src/app/admin/listings/page.tsx
"use client";

import { Package, Search, CheckCircle, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { fetchAllPages } from "@/lib/authStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const TYPE_COLOR: Record<string, string> = {
  service: "bg-blue-100 text-blue-700",
  product: "bg-purple-100 text-purple-700",
  food:    "bg-orange-100 text-orange-700",
};

const TABS = [
  { label: "All",      value: "" },
  { label: "Pending",  value: "false" },
  { label: "Live",     value: "true" },
];

export default function AdminListingsPage() {
  const router = useRouter();
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("");

  const load = (q = search, av = tab) => {
    setLoading(true);
    let url = `${API_URL}/api/admin/listings/?`;
    if (q) url += `search=${encodeURIComponent(q)}&`;
    if (av !== "") url += `is_available=${av}`;
    fetchAllPages(url)
      .then(d => setListings(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="min-h-screen bg-[#FFF8F0]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <AdminTopBar title="Listings" back="/admin" />

      <div className="px-4 pt-4 pb-28 max-w-2xl mx-auto space-y-3">

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            className="w-full bg-white border border-stone-200 rounded-xl pl-9 pr-4 py-2.5 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-teal-400"
            placeholder="Search title, vendor…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === "Enter" && load(search, tab)}
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          {TABS.map(t => (
            <button key={t.value}
              onClick={() => { setTab(t.value); load(search, t.value); }}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition ${tab === t.value ? "bg-teal-600 text-white" : "bg-white border border-stone-200 text-stone-600"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Count */}
        {!loading && (
          <p className="text-xs text-stone-400">{listings.length} listing{listings.length !== 1 ? "s" : ""}</p>
        )}

        {/* List */}
        {loading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-white border border-stone-200 rounded-2xl p-4 h-20 animate-pulse" />
            ))}
          </div>
        ) : listings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Package className="w-10 h-10 text-stone-300" />
            <p className="text-stone-400 text-sm">No listings found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {listings.map((l: any) => (
              <button key={l.id} onClick={() => router.push(`/admin/listings/${l.id}`)}
                className="w-full bg-white border border-stone-200 hover:border-teal-300 rounded-2xl p-4 text-left transition active:scale-[0.98]">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-stone-900 text-sm truncate">{l.title}</p>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${TYPE_COLOR[l.listing_type] || "bg-stone-100 text-stone-600"}`}>
                        {l.listing_type}
                      </span>
                    </div>
                    <p className="text-stone-500 text-xs mt-0.5">
                      {l.vendor?.username || l.vendor} · ₦{Number(l.price).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {l.is_available ? (
                      <span className="flex items-center gap-1 px-2.5 py-0.5 bg-teal-100 text-teal-700 rounded-full text-xs font-semibold">
                        <CheckCircle className="w-3 h-3" /> Live
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 px-2.5 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-semibold">
                        <XCircle className="w-3 h-3" /> Pending
                      </span>
                    )}
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
