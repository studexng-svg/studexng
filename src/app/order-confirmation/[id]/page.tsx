// src/app/order-confirmation/[id]/page.tsx
"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  CheckCircle,
  Package,
  Calendar,
  Clock,
  Home,
  MessageCircle,
  Star,
  ChevronLeft,
  Shield,
} from "lucide-react";

import { fetchWithAuth } from "@/lib/authStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

interface Order {
  id: number;
  reference: string;
  listing: {
    id: number;
    title: string;
    vendor: {
      username: string;
      business_name?: string;
    };
  };
  amount: number;
  status: string;
  created_at: string;
}

export default function OrderConfirmationPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.id as string;

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackHovered, setFeedbackHovered] = useState(0);
  const [feedbackComment, setFeedbackComment] = useState("");
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");

  const submitFeedback = async () => {
    if (!feedbackRating) { setFeedbackError("Please select a rating."); return; }
    setFeedbackSubmitting(true); setFeedbackError("");
    try {
      const res = await fetchWithAuth(`${API_URL}/api/reviews/submit-app-feedback/`, {
        method: "POST",
        body: JSON.stringify({ feedback_type: "buyer", rating: feedbackRating, comment: feedbackComment }),
      });
      if (res.ok) { setFeedbackSubmitted(true); }
      else {
        const d = await res.json();
        setFeedbackError(d?.error || d?.detail || "Failed to submit feedback.");
      }
    } catch { setFeedbackError("Network error. Please try again."); }
    finally { setFeedbackSubmitting(false); }
  };

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        setLoading(true);
        const res = await fetchWithAuth(`${API_URL}/api/orders/orders/${orderId}/`);
        if (!res.ok) throw new Error("Failed to fetch order");
        const data = await res.json();
        setOrder(data);
      } catch (err: any) {
        setError(err.message || "Could not load order details");
      } finally {
        setLoading(false);
      }
    };

    if (orderId) fetchOrder();
  }, [orderId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-[#FAFAF9] flex flex-col items-center justify-center px-6 text-center"
        style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <div className="w-16 h-16 bg-stone-100 rounded-full flex items-center justify-center mb-4">
          <Package className="w-8 h-8 text-stone-400" />
        </div>
        <h2 className="text-lg font-bold text-stone-900 mb-1"
          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
          Order Not Found
        </h2>
        <p className="text-sm text-stone-400 mb-6">{error || "We couldn't load this order."}</p>
        <Link href="/home">
          <motion.button whileTap={{ scale: 0.97 }}
            className="px-6 py-3 rounded-full font-semibold text-white text-sm"
            style={{ background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" }}>
            Back to Home
          </motion.button>
        </Link>
      </div>
    );
  }

  const vendorName = order.listing.vendor.business_name || order.listing.vendor.username;

  return (
    <div className="min-h-screen bg-[#FAFAF9]" style={{ fontFamily: "'DM Sans', sans-serif" }}>

      {/* STICKY HEADER */}
      <div className="sticky top-0 bg-white/80 backdrop-blur-md z-40 border-b border-stone-100 shadow-sm">
        <div className="flex items-center justify-between px-4 py-3 max-w-2xl mx-auto">
          <button
            onClick={() => router.push("/home")}
            className="p-2.5 bg-white border border-stone-200 rounded-full shadow-sm active:scale-95 transition-all"
          >
            <ChevronLeft className="w-5 h-5 text-stone-600" />
          </button>
          <h1 className="text-base font-bold text-stone-900"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
            Order Confirmed
          </h1>
          <div className="w-10" />
        </div>
      </div>

      <div className="px-4 pt-6 pb-56 md:pb-16 max-w-2xl mx-auto space-y-5">

        {/* SUCCESS ICON */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
          className="flex justify-center pt-2"
        >
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center shadow-lg"
            style={{ background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" }}
          >
            <CheckCircle className="w-10 h-10 text-white" />
          </div>
        </motion.div>

        {/* HEADING */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-center"
        >
          <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-semibold">Payment Successful</p>
          <h2 className="text-2xl font-bold text-stone-900 mt-0.5"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
            Order Confirmed!
          </h2>
          <p className="text-sm text-stone-400 mt-1">
            Your order is in escrow and the seller has been notified.
          </p>
        </motion.div>

        {/* ORDER DETAILS CARD */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm space-y-4"
        >
          {/* Reference */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-teal-50 rounded-full flex items-center justify-center flex-shrink-0">
              <Package className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <p className="text-xs text-stone-400">Order Reference</p>
              <p className="font-bold text-stone-900 text-sm">{order.reference}</p>
            </div>
          </div>

          <div className="border-t border-stone-100" />

          {/* Date + Status */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-start gap-2.5">
              <Calendar className="w-4 h-4 text-teal-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-stone-400">Order Date</p>
                <p className="font-semibold text-stone-900 text-sm">
                  {new Date(order.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Clock className="w-4 h-4 text-teal-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-stone-400">Status</p>
                <p className="font-semibold text-teal-600 text-sm capitalize">
                  {order.status.replace("_", " ")}
                </p>
              </div>
            </div>
          </div>

          <div className="border-t border-stone-100" />

          {/* Item + Amount */}
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-stone-400">Item</p>
              <p className="font-bold text-stone-900 text-sm mt-0.5">{order.listing.title}</p>
              <p className="text-xs text-stone-400 mt-0.5">from {vendorName}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-stone-400">Amount</p>
              <p className="text-xl font-bold text-stone-900 mt-0.5">₦{order.amount.toLocaleString()}</p>
            </div>
          </div>
        </motion.div>

        {/* ESCROW INFO */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-teal-50 border border-teal-100 rounded-2xl p-4 flex items-start gap-3"
        >
          <div className="w-9 h-9 bg-teal-600 rounded-full flex items-center justify-center flex-shrink-0">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="font-semibold text-teal-900 text-sm">Protected by Escrow</p>
            <p className="text-xs text-teal-700 mt-0.5 leading-relaxed">
              Your payment is safely held by StudEx. Funds are released to the seller only after you confirm receipt.
            </p>
            <div className="flex items-center gap-1.5 mt-2 text-xs text-teal-700 font-semibold">
              <Clock className="w-3 h-3" />
              <span>You have 7 days to confirm or dispute</span>
            </div>
          </div>
        </motion.div>

        {/* ACTION BUTTONS */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="grid grid-cols-2 gap-3"
        >
          <Link href="/home" className="w-full">
            <motion.button
              whileTap={{ scale: 0.97 }}
              className="w-full py-3 rounded-full font-semibold text-stone-600 bg-white border border-stone-200 text-sm flex items-center justify-center gap-2 shadow-sm transition-all"
            >
              <Home className="w-4 h-4" />
              Back to Home
            </motion.button>
          </Link>

          <Link href={`/account/orders/${order.id}`} className="w-full">
            <motion.button
              whileTap={{ scale: 0.97 }}
              className="w-full py-3 rounded-full font-semibold text-white text-sm flex items-center justify-center gap-2 transition-all"
              style={{ background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" }}
            >
              <Package className="w-4 h-4" />
              View Order
            </motion.button>
          </Link>
        </motion.div>

        {/* CONTACT SELLER */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <motion.button
            whileTap={{ scale: 0.97 }}
            className="w-full py-3 rounded-full font-semibold text-stone-600 bg-white border border-stone-200 text-sm flex items-center justify-center gap-2 shadow-sm transition-all"
          >
            <MessageCircle className="w-4 h-4" />
            Contact Seller
          </motion.button>
        </motion.div>

        {/* NOTE */}
        <p className="text-center text-xs text-stone-400">
          Check your email for order confirmation and tracking updates
        </p>

        {/* APP FEEDBACK */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
        >
          {feedbackSubmitted ? (
            <div className="bg-teal-50 border border-teal-200 rounded-2xl p-5 text-center">
              <p className="font-bold text-teal-800">Thanks for your feedback!</p>
              <p className="text-sm text-teal-700 mt-1">We use it to improve StudEx for everyone.</p>
            </div>
          ) : (
            <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm space-y-4">
              <div>
                <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-semibold">Quick Feedback</p>
                <h3 className="text-lg font-bold text-stone-900 mt-0.5"
                  style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                  How was your experience?
                </h3>
                <p className="text-sm text-stone-400 mt-0.5">Rate the StudEx checkout experience</p>
              </div>

              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map(star => (
                  <motion.button key={star} whileTap={{ scale: 0.8 }}
                    onClick={() => setFeedbackRating(star)}
                    onMouseEnter={() => setFeedbackHovered(star)}
                    onMouseLeave={() => setFeedbackHovered(0)}>
                    <Star className={`w-9 h-9 transition-all ${
                      star <= (feedbackHovered || feedbackRating) ? "fill-amber-400 text-amber-400" : "text-stone-200"
                    }`} />
                  </motion.button>
                ))}
              </div>

              {feedbackRating > 0 && (
                <p className="text-sm font-semibold text-teal-600 -mt-1">
                  {["", "Poor", "Fair", "Good", "Great", "Excellent!"][feedbackRating]}
                </p>
              )}

              <textarea
                value={feedbackComment}
                onChange={e => setFeedbackComment(e.target.value)}
                placeholder="Any thoughts? (optional)"
                rows={2}
                className="w-full px-4 py-3 rounded-xl border border-stone-200 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 bg-white placeholder:text-stone-400 resize-none transition"
              />

              {feedbackError && <p className="text-red-500 text-sm">{feedbackError}</p>}

              <motion.button
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                onClick={submitFeedback}
                disabled={feedbackSubmitting || !feedbackRating}
                className="w-full py-3 rounded-full font-semibold text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all mb-4"
                style={{ background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" }}>
                {feedbackSubmitting ? "Submitting..." : "Submit Feedback"}
              </motion.button>
            </div>
          )}
        </motion.div>

      </div>
    </div>
  );
}
