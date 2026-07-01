"use client";
import { useState } from "react";
import { Star } from "lucide-react";
import { TEAL } from "@/lib/tokens";
import { api } from "@/lib/api";

export default function ReviewForm({ orderId, vendorName, onSuccess }: {
  orderId: number; vendorName: string; onSuccess?: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!rating) { setError("Please select a rating."); return; }
    setSubmitting(true); setError("");
    try {
      const res = await api.reviews.submit({ order: orderId, rating, comment });
      if (res.ok) { setSubmitted(true); onSuccess?.(); }
      else {
        const d = await res.json();
        setError(d?.order?.[0] || d?.detail || "Failed to submit review.");
      }
    } catch { setError("Network error. Please try again."); }
    finally { setSubmitting(false); }
  };

  if (submitted) return (
    <div className="bg-teal-50 border border-teal-200 rounded-2xl p-5 text-center animate-fadeUp">
      <p className="font-bold text-teal-800">Review submitted! ⭐</p>
      <p className="text-sm text-teal-700 mt-1">Thanks for rating {vendorName}.</p>
    </div>
  );

  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm space-y-4">
      <div>
        <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-semibold">Leave a Review</p>
        <h3 className="text-lg font-bold text-stone-900 mt-0.5" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          Rate your experience
        </h3>
        <p className="text-sm text-stone-400 mt-0.5">How was {vendorName}?</p>
      </div>

      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map(star => (
          <button key={star} className="tap-scale"
            onClick={() => setRating(star)}
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(0)}>
            <Star className={`w-9 h-9 transition-all ${
              star <= (hovered || rating) ? "fill-amber-400 text-amber-400" : "text-stone-200"
            }`} />
          </button>
        ))}
      </div>

      {rating > 0 && (
        <p className="text-sm font-semibold text-teal-600 -mt-1">
          {["", "Poor", "Fair", "Good", "Great", "Excellent!"][rating]}
        </p>
      )}

      <textarea
        value={comment}
        onChange={e => setComment(e.target.value)}
        placeholder="Share your experience (optional)..."
        rows={3}
        className="w-full px-4 py-3 rounded-xl border border-stone-200 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 bg-white placeholder:text-stone-400 resize-none transition"
      />

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={submitting || !rating}
        className="w-full py-3 rounded-full font-semibold text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all hover-scale tap-scale"
        style={{ background: TEAL }}>
        {submitting ? "Submitting..." : "Submit Review"}
      </button>
    </div>
  );
}
