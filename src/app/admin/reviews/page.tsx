// src/app/admin/reviews/page.tsx
"use client";

import { Star, Search, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { fetchWithAuth, fetchAllPages } from "@/lib/authStore";
import { CampusPills, type Campus } from "@/components/admin/CampusPills";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} className={`w-3 h-3 ${i <= rating ? "fill-amber-400 text-amber-400" : "text-stone-200"}`} />
      ))}
    </div>
  );
}

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [campus, setCampus] = useState<Campus>("");
  const [deleting, setDeleting] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const load = (s = search, c = campus) => {
    setLoading(true);
    let url = `${API_URL}/api/admin/reviews/?`;
    if (s) url += `search=${encodeURIComponent(s)}&`;
    if (c) url += `campus=${c}`;
    fetchAllPages(url)
      .then(d => setReviews(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const deleteReview = async (id: number) => {
    if (confirmId !== id) { setConfirmId(id); return; }
    setDeleting(id);
    setConfirmId(null);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/admin/reviews/${id}/`, { method: "DELETE" });
      if (res.status === 204 || res.ok) {
        setReviews(prev => prev.filter(r => r.id !== id));
      }
    } catch {}
    finally { setDeleting(null); }
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <AdminTopBar title="Reviews" back="/admin" />

      <div className="px-4 pt-4 pb-28 max-w-2xl mx-auto space-y-3">

        <CampusPills value={campus} onChange={c => { setCampus(c); load(search, c); }} />

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input className="w-full bg-white border border-stone-200 rounded-xl pl-9 pr-4 py-2.5 text-sm placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-teal-400"
            placeholder="Search reviewer, vendor, listing…"
            value={search} onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === "Enter" && load(search, campus)} />
        </div>

        {!loading && <p className="text-xs text-stone-400">{reviews.length} review{reviews.length !== 1 ? "s" : ""}</p>}

        {loading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white border border-stone-200 rounded-2xl p-4 h-24 animate-pulse" />
            ))}
          </div>
        ) : reviews.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Star className="w-10 h-10 text-stone-300" />
            <p className="text-stone-400 text-sm">No reviews found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {reviews.map((r: any) => (
              <div key={r.id} className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <StarRating rating={r.rating} />
                      <span className="text-xs text-stone-400">{r.rating}/5</span>
                    </div>
                    <p className="text-stone-700 text-sm leading-relaxed line-clamp-2">{r.comment || <span className="text-stone-400 italic">No comment</span>}</p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className="text-xs text-stone-500">@{r.reviewer} → @{r.vendor}</span>
                      {r.listing_title && <span className="text-xs text-stone-400">· {r.listing_title}</span>}
                    </div>
                    <p className="text-stone-400 text-xs mt-0.5">
                      {r.created_at ? new Date(r.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : ""}
                    </p>
                  </div>
                  <button onClick={() => deleteReview(r.id)} disabled={deleting === r.id}
                    className={`p-2 rounded-xl transition flex-shrink-0 ${confirmId === r.id ? "bg-red-100 text-red-600" : "text-stone-400 hover:text-red-500 hover:bg-red-50"} disabled:opacity-50`}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {confirmId === r.id && (
                  <p className="text-xs text-red-500 mt-2 text-center">Tap again to confirm delete</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
