// src/app/admin/conversations/page.tsx
"use client";

import { MessageCircle, Search, ChevronRight } from "lucide-react";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { fetchAllPages, BASE_URL } from "@/lib/api";
import { CampusPills, type Campus } from "@/components/admin/CampusPills";

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function AdminConversationsPage() {
  const router = useRouter();
  const [convs, setConvs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [campus, setCampus] = useState<Campus>("");
  const filtersRef = useRef({ search: "", campus: "" as Campus });

  const load = useCallback((s = search, c = campus, silent = false) => {
    if (!silent) setLoading(true);
    let url = `${BASE_URL}/api/admin/conversations/?`;
    if (s) url += `search=${encodeURIComponent(s)}&`;
    if (c) url += `campus=${c}`;
    fetchAllPages(url)
      .then(d => setConvs(d))
      .catch(() => {})
      .finally(() => { if (!silent) setLoading(false); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  filtersRef.current = { search, campus };

  useEffect(() => {
    load();
    const interval = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      const f = filtersRef.current;
      load(f.search, f.campus, true);
    }, 60000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <AdminTopBar title="Conversations" back="/admin" />

      <div className="px-6 pt-5 pb-28 space-y-4">

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white border border-stone-200 rounded-2xl p-3 text-center shadow-sm">
            <p className="text-xl font-bold text-stone-900">{loading ? "—" : convs.length}</p>
            <p className="text-xs text-stone-400">Total Conversations</p>
          </div>
          <div className="bg-white border border-stone-200 rounded-2xl p-3 text-center shadow-sm">
            <p className="text-xl font-bold text-stone-900">
              {loading ? "—" : convs.reduce((a, c) => a + (c.message_count || 0), 0)}
            </p>
            <p className="text-xs text-stone-400">Total Messages</p>
          </div>
        </div>

        {/* Campus filter */}
        <CampusPills value={campus} onChange={c => { setCampus(c); load(search, c); }} />

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === "Enter" && load(search, campus)}
            placeholder="Search buyer, seller, listing…"
            className="w-full pl-10 pr-4 py-3 bg-white border border-stone-200 rounded-xl text-stone-900 placeholder:text-stone-400 text-sm focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20"
          />
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="p-4 h-20 animate-pulse border-b border-stone-100 last:border-0 bg-stone-50/50" />
            ))}
          </div>
        ) : convs.length === 0 ? (
          <div className="bg-white border border-stone-100 rounded-2xl p-14 text-center">
            <MessageCircle className="w-10 h-10 text-stone-200 mx-auto mb-3" />
            <p className="text-stone-400 text-sm">No conversations found</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
            {convs.map(conv => (
              <div
                key={conv.id}
                onClick={() => router.push(`/admin/conversations/${conv.id}`)}
                className="border-b border-stone-100 last:border-0 p-4 hover:bg-stone-50/50 cursor-pointer transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center flex-shrink-0">
                    <MessageCircle className="w-4 h-4 text-purple-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 justify-between">
                      <p className="font-semibold text-stone-900 text-sm">
                        {conv.buyer} → {conv.seller}
                      </p>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {conv.listing_campus && (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                            conv.listing_campus === "futo" ? "bg-orange-100 text-orange-700"
                            : conv.listing_campus === "imsu" ? "bg-amber-100 text-amber-700"
                            : "bg-teal-50 text-teal-700"
                          }`}>
                            {conv.listing_campus.toUpperCase()}
                          </span>
                        )}
                        <ChevronRight className="w-4 h-4 text-stone-400" />
                      </div>
                    </div>
                    {conv.listing_title && (
                      <p className="text-teal-600 text-xs font-medium truncate mt-0.5">{conv.listing_title}</p>
                    )}
                    {conv.last_message && (
                      <p className="text-stone-400 text-xs truncate mt-0.5">{(() => {
                        const m = conv.last_message;
                        if (!m.startsWith('[quoted:@')) return m;
                        const ci = m.indexOf(']\n');
                        return ci !== -1 ? m.substring(ci + 2) || m : m;
                      })()}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-stone-300 text-xs">
                        {conv.message_count} message{conv.message_count !== 1 ? "s" : ""}
                      </span>
                      {conv.last_message_at && (
                        <span className="text-stone-300 text-xs">{timeAgo(conv.last_message_at)}</span>
                      )}
                    </div>
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
