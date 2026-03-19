"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { Star } from "lucide-react";
import { fetchWithAuth } from "@/lib/authStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

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
      const res = await fetchWithAuth(`${API_URL}/api/reviews/reviews/`, {
        method: "POST",
        body: JSON.stringify({ order: orderId, rating, comment }),
      });
      if (res.ok) { setSubmitted(true); onSuccess?.(); }
      else {
        const d = await res.json();
        setError(d?.order?.[0] || d?.detail || "Failed to submit review.");
      }
    } catch { setError("Network error. Please try again."); }
    finally { setSubmitting(false); }
  };

  if (submitted) return (
    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
      className="bg-green-50 dark:bg-green-900/20 border border-green-200 rounded-2xl p-5 text-center">
      <p className="text-2xl mb-1">🎉</p>
      <p className="font-black text-green-800 dark:text-green-300">Review submitted!</p>
      <p className="text-sm text-green-700 mt-1">Thanks for rating {vendorName}.</p>
    </motion.div>
  );

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 space-y-4">
      <h3 className="font-black text-gray-800 dark:text-gray-200">Rate your experience</h3>
      <p className="text-sm text-gray-500 -mt-2">How was {vendorName}?</p>
      <div className="flex gap-2">
        {[1,2,3,4,5].map(star => (
          <motion.button key={star} whileTap={{ scale: 0.8 }}
            onClick={() => setRating(star)}
            onMouseEnter={() => setHovered(star)} onMouseLeave={() => setHovered(0)}>
            <Star className={`w-9 h-9 transition-all ${
              star <= (hovered || rating) ? "fill-amber-400 text-amber-400" : "text-gray-300 dark:text-gray-600"
            }`} />
          </motion.button>
        ))}
      </div>
      {rating > 0 && (
        <p className="text-sm font-bold text-purple-600 dark:text-purple-400 -mt-1">
          {["","Poor 😕","Fair 😐","Good 👍","Great 😊","Excellent! 🌟"][rating]}
        </p>
      )}
      <textarea value={comment} onChange={e => setComment(e.target.value)}
        placeholder="Share your experience (optional)..." rows={3}
        className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:border-purple-400 resize-none" />
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <motion.button whileTap={{ scale: 0.97 }} onClick={handleSubmit}
        disabled={submitting || !rating}
        className={`w-full py-3 rounded-xl font-bold text-white text-sm transition-all ${
          rating ? "bg-gradient-to-r from-purple-600 to-teal-500" : "bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed"
        }`}>
        {submitting ? "Submitting..." : "Submit Review"}
      </motion.button>
    </div>
  );
}
