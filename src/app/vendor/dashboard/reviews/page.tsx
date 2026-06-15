"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/authStore";
import { Star } from "lucide-react";
import { EmptyState, LoadingSpinner, HEADING_FONT } from "../_shared";
import { api } from "@/lib/api";

export default function ReviewsPage() {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    api.pub.reviews({ vendor: String(user.id) })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setReviews(Array.isArray(d) ? d : (d.results || [])); })
      .finally(() => setLoading(false));
  }, [user]);

  const avg = reviews.length
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : null;

  if (loading) return <LoadingSpinner />;

  return (
    <div className="pb-4 space-y-3">
      <div className="mb-1">
        <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-bold mb-0.5">Feedback</p>
        <h2 className="font-black text-stone-900 text-xl tracking-tight" style={HEADING_FONT}>Reviews</h2>
      </div>

      {reviews.length > 0 && (
        <div className="bg-white border border-amber-100 rounded-2xl p-4 shadow-sm flex items-center gap-4">
          <div className="text-center">
            <p className="text-3xl font-bold text-amber-500">{avg}</p>
            <div className="flex gap-0.5 mt-1 justify-center">
              {[1,2,3,4,5].map(s => (
                <Star key={s} className={`w-3.5 h-3.5 ${s <= Math.round(Number(avg)) ? "text-amber-400 fill-amber-400" : "text-stone-200 fill-stone-200"}`} />
              ))}
            </div>
          </div>
          <div>
            <p className="font-bold text-stone-800 text-sm">{reviews.length} Reviews</p>
            <p className="text-xs text-stone-400">From verified buyers</p>
          </div>
        </div>
      )}

      {reviews.length === 0 ? (
        <EmptyState icon={Star} message="No reviews yet. Complete orders to get rated!" />
      ) : (
        reviews.map(review => (
          <div key={review.id} className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-stone-800 text-sm">{review.reviewer_username}</span>
              <div className="flex gap-0.5">
                {[1,2,3,4,5].map(s => (
                  <Star key={s} className={`w-3.5 h-3.5 ${s <= review.rating ? "text-amber-400 fill-amber-400" : "text-stone-200 fill-stone-200"}`} />
                ))}
              </div>
            </div>
            {review.listing_title && (
              <p className="text-xs text-teal-600 font-medium mb-1">{review.listing_title}</p>
            )}
            {review.comment && (
              <p className="text-sm text-stone-600">{review.comment}</p>
            )}
            <p className="text-xs text-stone-400 mt-2">
              {new Date(review.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          </div>
        ))
      )}
    </div>
  );
}
