// src/app/seller/orders/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, Package, Tag, DollarSign, FileText, Calendar, MapPin, User, Clock, CheckCircle, AlertCircle } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

interface Order {
  id: number;
  reference: string;
  buyer: {
    username: string;
    phone?: string;
  };
  amount: number;
  created_at: string;
  status: "pending_confirmation" | "completed" | "disputed" | "refunded" | "paid" | "seller_completed";
  type: "service" | "food";
  service_details?: {
    service_name: string;
    date: string;
    time: string;
    location: string;
  };
  food_items?: Array<{
    title: string;
    quantity: number;
    price: number;
  }>;
}

export default function SellerOrderDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [completing, setCompleting] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);

  useEffect(() => {
    const accessToken = localStorage.getItem("accessToken");

    if (!accessToken) {
      setError("Please log in to view orders");
      setLoading(false);
      return;
    }

    const fetchOrder = async () => {
      try {
        const res = await fetch(`${API_URL}/api/orders/${id}/`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!res.ok) {
          if (res.status === 404) {
            setError("Order not found");
          } else if (res.status === 401) {
            setError("Session expired. Redirecting...");
            setTimeout(() => router.push("/auth"), 2000);
          } else {
            throw new Error("Failed to load order");
          }
          setLoading(false);
          return;
        }

        const data = await res.json();
        setOrder(data);
      } catch (err) {
        setError("Failed to load order details");
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [id, router]);

  const handleMarkAsComplete = async () => {
    if (!order) return;
    setCompleting(true);
    const accessToken = localStorage.getItem("accessToken");
    try {
      const res = await fetch(`${API_URL}/api/orders/${order.id}/mark_complete/`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || "Failed to mark as complete");
      }
      const data = await res.json();
      setOrder(data.order);
      setShowCompleteModal(false);
      setTimeout(() => router.push("/seller/orders"), 1500);
    } catch (err) {
      alert(`Failed to complete order: ${err instanceof Error ? err.message : "Try again"}`);
    } finally {
      setCompleting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAF9]">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>
          <Clock className="w-10 h-10 text-teal-600" />
        </motion.div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center p-6" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <div className="text-center bg-white border border-stone-200 rounded-2xl p-8 shadow-sm max-w-sm w-full">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-stone-800 mb-2" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
            Order Not Found
          </h2>
          <p className="text-sm text-stone-500 mb-6">{error || "This order may have been removed."}</p>
          <Link href="/seller/orders">
            <button
              className="px-8 py-3 text-white font-semibold rounded-full shadow-md text-sm"
              style={{ background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" }}
            >
              Back to Orders
            </button>
          </Link>
        </div>
      </div>
    );
  }

  const isService = order.type === "service";
  const isPending = order.status === "paid" || order.status === "seller_completed";
  const isCompleted = order.status === "completed";

  return (
    <div className="min-h-screen bg-[#FAFAF9]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* HEADER */}
      <div className="sticky top-0 bg-white/80 backdrop-blur-md z-40 border-b border-stone-100 shadow-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={() => router.back()} className="p-2.5 bg-white border border-stone-200 rounded-full shadow-sm active:scale-95 transition-all">
            <ChevronLeft className="w-5 h-5 text-stone-600" />
          </button>
          <h1 className="text-base font-bold text-stone-900" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
            Order Details
          </h1>
          <div className="w-10" />
        </div>
      </div>

      <div className="px-4 pt-6 pb-32 space-y-4 max-w-2xl mx-auto">
        {/* ORDER ID + STATUS */}
        <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm flex justify-between items-start">
          <div>
            <p className="text-xs text-stone-400 font-medium">Order ID</p>
            <p className="text-2xl font-bold text-stone-900 mt-0.5">#{order.reference}</p>
            <p className="text-xs text-stone-400 mt-1">{new Date(order.created_at).toLocaleString()}</p>
          </div>
          <span className={`px-3 py-1.5 rounded-full font-medium text-xs flex items-center gap-1.5 ${
            isPending ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
          }`}>
            {isPending ? <Clock className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5" />}
            {isPending ? "Pending" : "Completed"}
          </span>
        </div>

        {/* STATUS INFO */}
        {isPending && order.status === "paid" && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex gap-3">
            <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
              <Clock className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="font-semibold text-blue-900 text-sm">Mark Order as Complete</p>
              <p className="text-xs text-blue-700 mt-1">
                {isService
                  ? "Once you've completed the service, tap the button below to confirm."
                  : "Once the food is ready for pickup/delivery, confirm it here."}
              </p>
              <p className="text-xs text-blue-600 mt-1">
                Payment (₦{order.amount.toLocaleString()}) is held in escrow until the buyer confirms receipt.
              </p>
            </div>
          </div>
        )}

        {order.status === "seller_completed" && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3">
            <div className="w-9 h-9 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
              <Clock className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <p className="font-semibold text-amber-900 text-sm">Waiting for Buyer Confirmation</p>
              <p className="text-xs text-amber-700 mt-1">
                You've marked this order as complete. The buyer will now confirm receipt and release the payment.
              </p>
            </div>
          </div>
        )}

        {isCompleted && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex gap-3">
            <div className="w-9 h-9 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <p className="font-semibold text-emerald-900 text-sm">Order Completed!</p>
              <p className="text-xs text-emerald-700 mt-1">
                ₦{order.amount.toLocaleString()} has been added to your wallet.
              </p>
            </div>
          </div>
        )}

        {/* CUSTOMER DETAILS */}
        <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm">
          <h3 className="font-semibold text-stone-800 mb-4 flex items-center gap-2 text-sm">
            <User className="w-4 h-4 text-teal-600" />
            Customer Details
          </h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-stone-50 rounded-xl">
              <div className="w-9 h-9 bg-teal-50 rounded-full flex items-center justify-center">
                <User className="w-4 h-4 text-teal-600" />
              </div>
              <div>
                <p className="font-semibold text-stone-900 text-sm">{order.buyer.username}</p>
                <p className="text-xs text-stone-400">Customer Name</p>
              </div>
            </div>

            {isService && order.service_details && (
              <div className="border-t border-stone-100 pt-3 space-y-1.5 text-sm text-stone-600">
                <p><span className="font-semibold text-stone-800">Service:</span> {order.service_details.service_name}</p>
                <p className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  <span><span className="font-semibold text-stone-800">Date:</span> {order.service_details.date}</span>
                </p>
                <p className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  <span><span className="font-semibold text-stone-800">Time:</span> {order.service_details.time}</span>
                </p>
                <p className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  <span><span className="font-semibold text-stone-800">Location:</span> {order.service_details.location}</span>
                </p>
              </div>
            )}

            {!isService && order.food_items && (
              <div className="border-t border-stone-100 pt-3">
                <p className="font-semibold text-stone-800 text-sm mb-2">Order Items:</p>
                <div className="space-y-1">
                  {order.food_items.map((item, i) => (
                    <div key={i} className="text-sm text-stone-600 p-2 bg-stone-50 rounded-lg">
                      {item.title} ×{item.quantity} — ₦{(item.price * item.quantity).toLocaleString()}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* AMOUNT */}
        <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm">
          <p className="text-xs text-stone-400 font-medium mb-1">Order Amount</p>
          <p className="text-3xl font-bold text-teal-600">₦{order.amount.toLocaleString()}</p>
          <p className="text-xs text-stone-400 mt-2">
            {isCompleted
              ? "This amount has been released to your wallet."
              : "This amount is in escrow. It will be released to your wallet once the buyer confirms receipt."}
          </p>
        </div>

        {/* MARK AS COMPLETE BUTTON */}
        {order.status === "paid" && (
          <button
            onClick={() => setShowCompleteModal(true)}
            className="w-full py-4 text-white font-semibold rounded-full shadow-md flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
            style={{ background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" }}
          >
            <CheckCircle className="w-5 h-5" />
            Mark as Complete
          </button>
        )}

        {isCompleted && (
          <div className="text-center py-5 bg-emerald-50 border border-emerald-100 rounded-2xl">
            <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
            <p className="text-stone-700 font-medium text-sm">Order completed and payment received!</p>
          </div>
        )}
      </div>

      {/* COMPLETE ORDER MODAL */}
      {showCompleteModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => !completing && setShowCompleteModal(false)}
        >
          <motion.div
            initial={{ scale: 0.95, y: 16 }}
            animate={{ scale: 1, y: 0 }}
            className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl border border-stone-100"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-stone-900 mb-3" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
              Mark as Complete?
            </h3>
            <p className="text-stone-600 text-sm mb-5">
              {isService
                ? "Are you ready to mark this service as complete?"
                : "Is the food ready for pickup/delivery?"}
            </p>

            <div className="bg-stone-50 border border-stone-100 rounded-xl p-4 mb-5">
              <p className="text-xs text-stone-500">Order Amount</p>
              <p className="text-2xl font-bold text-teal-600 mt-0.5">₦{order.amount.toLocaleString()}</p>
              <p className="text-xs text-stone-400 mt-1">In escrow until buyer confirms</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => !completing && setShowCompleteModal(false)}
                disabled={completing}
                className="flex-1 py-3 bg-stone-100 text-stone-700 rounded-full font-semibold text-sm disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleMarkAsComplete}
                disabled={completing}
                className="flex-1 py-3 text-white rounded-full font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" }}
              >
                {completing ? (
                  <>
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
                      <Clock className="w-4 h-4" />
                    </motion.div>
                    Processing...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Yes, Complete
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
