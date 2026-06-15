"use client";

import { useState } from "react";
import { GRAD } from "@/lib/tokens";
import { Star } from "lucide-react";
import { HEADING_FONT } from "../_shared";
import { api } from "@/lib/api";

export default function FeedbackPage() {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!rating) { setError("Please select a rating."); return; }
    setSubmitting(true); setError("");
    try {
      const res = await api.reviews.submitFeedback({ feedback_type: "vendor", rating, comment });
      if (res.ok) { setSent(true); }
      else {
        const d = await res.json();
        setError(d?.error || d?.detail || "Failed to submit feedback.");
      }
    } catch { setError("Network error. Please try again."); }
    finally { setSubmitting(false); }
  };

  if (sent) {
    return (
      <div className="pb-4">
        <div className="mb-5">
          <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-bold mb-0.5">Rate Us</p>
          <h2 className="font-black text-stone-900 text-xl tracking-tight" style={HEADING_FONT}>Platform Feedback</h2>
        </div>
        <div className="bg-teal-50 border border-teal-200 rounded-2xl p-6 text-center">
          <p className="font-bold text-teal-800 text-lg">Thanks for your feedback!</p>
          <p className="text-sm text-teal-700 mt-1">We use it to improve StudEx for vendors.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-4">
      <div className="mb-5">
        <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-bold mb-0.5">Rate Us</p>
        <h2 className="font-black text-stone-900 text-xl tracking-tight" style={HEADING_FONT}>Platform Feedback</h2>
        <p className="text-stone-400 text-xs mt-0.5">Help us build a better marketplace for vendors</p>
      </div>

      <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm space-y-4">
        <div>
          <h3 className="text-lg font-black text-stone-900 tracking-tight" style={HEADING_FONT}>
            How&apos;s selling on StudEx?
          </h3>
          <p className="text-sm text-stone-400 mt-0.5">Your feedback helps us improve the platform</p>
        </div>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map(star => (
            <button key={star}
              onClick={() => setRating(star)}
              onMouseEnter={() => setHovered(star)}
              onMouseLeave={() => setHovered(0)}
              className="active:scale-90 transition-transform">
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
          placeholder="What can we improve for vendors? (optional)"
          rows={3}
          className="w-full px-4 py-3 rounded-xl border border-stone-200 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 bg-white placeholder:text-stone-400 resize-none transition"
        />
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button
          onClick={submit}
          disabled={submitting || !rating}
          className="w-full py-3 rounded-full font-semibold text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          style={{ background: GRAD }}>
          {submitting ? "Submitting..." : "Submit Feedback"}
        </button>
      </div>
    </div>
  );
}
