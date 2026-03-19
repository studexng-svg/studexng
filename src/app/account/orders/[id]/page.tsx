"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Package, CheckCircle, Clock, AlertCircle, ChevronLeft, MessageCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth, fetchWithAuth } from "@/lib/authStore";
import ReviewForm from "@/components/ReviewForm";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

interface Order {
  id: number;
  reference: string;
  listing: { id: number; title: string; vendor: { id: number; username: string } };
  amount: number;
  created_at: string;
  status: "pending" | "paid" | "seller_completed" | "completed" | "disputed" | "cancelled";
}

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { isLoggedIn, isHydrated } = useAuth();
  const orderId = params.id as string;

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState("");
  const [canReview, setCanReview] = useState(false);
  const [loyaltyReward, setLoyaltyReward] = useState<string | null>(null);

  useEffect(() => {
    if (isHydrated && !isLoggedIn) { router.push("/auth"); return; }
    if (!isHydrated || !isLoggedIn) return;

    const load = async () => {
      try {
        const res = await fetchWithAuth(`${API_URL}/api/orders/orders/${orderId}/`);
        if (res.status === 404) { setError("not_found"); return; }
        if (!res.ok) throw new Error();
        const data = await res.json();
        setOrder(data);
        if (data.status === 'completed') {
          const rv = await fetchWithAuth(`${API_URL}/api/reviews/reviews/can-review/${orderId}/`);
          if (rv.ok) { const d = await rv.json(); setCanReview(d.can_review); }
        }
      } catch { setError("failed"); }
      finally { setLoading(false); }
    };
    load();
  }, [isHydrated, isLoggedIn, orderId, router]);

  const handleConfirm = async () => {
    if (!order) return;
    setConfirming(true);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/orders/orders/${orderId}/confirm/`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setOrder(prev => prev ? { ...prev, status: "completed" } : null);
        setCanReview(true);
        if (data.loyalty_reward?.awarded) setLoyaltyReward(data.loyalty_reward.message);
        setShowModal(false);
      } else { alert("Failed to confirm. Please try again."); }
    } catch { alert("Network error."); }
    finally { setConfirming(false); }
  };

  const handleOpenChat = async () => {
    if (!order) return;
    try {
      const res = await fetchWithAuth(`${API_URL}/api/chat/conversations/`, {
        method: "POST",
        body: JSON.stringify({
          listing_id: order.listing?.id,
          seller_id: order.listing?.vendor?.id,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        router.push(`/chat/${data.id}`);
      }
    } catch {
      router.push("/chat");
    }
  };

  const statusColor = (s: string) => ({
    paid: "bg-amber-100 text-amber-700",
    seller_completed: "bg-blue-100 text-blue-700",
    completed: "bg-emerald-100 text-emerald-700",
    disputed: "bg-red-100 text-red-700",
    cancelled: "bg-gray-100 text-gray-500",
  }[s] || "bg-gray-100 text-gray-500");

  const statusLabel = (s: string) => ({
    pending: "Pending Payment", paid: "In Escrow", seller_completed: "Seller Completed",
    completed: "Completed", disputed: "Disputed", cancelled: "Cancelled",
  }[s] || s);

  if (!isHydrated || loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}>
        <Clock className="w-10 h-10 text-purple-600" />
      </motion.div>
    </div>
  );

  if (error === "not_found" || !order) return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-6">
      <div className="text-center bg-white dark:bg-gray-900 rounded-3xl p-8 shadow-xl">
        <AlertCircle className="w-14 h-14 text-red-500 mx-auto mb-3" />
        <h2 className="text-xl font-black text-gray-800 dark:text-white mb-2">Order Not Found</h2>
        <Link href="/account/orders">
          <button className="mt-4 px-6 py-3 bg-gradient-to-r from-purple-600 to-teal-500 text-white font-bold rounded-xl">Back to Orders</button>
        </Link>
      </div>
    </div>
  );

  const canConfirm = order.status === 'paid' || order.status === 'seller_completed';
  const isCompleted = order.status === 'completed';

  return (
    <>
      {/* TOP BAR */}
      <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        className="sticky top-0 bg-white dark:bg-gray-900 backdrop-blur-xl z-40 border-b border-gray-100 dark:border-gray-800 shadow-sm">
        <div className="flex items-center justify-between p-4 max-w-4xl mx-auto">
          <Link href="/account/orders">
            <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition">
              <ChevronLeft className="w-6 h-6 text-purple-600" />
            </button>
          </Link>
          <h1 className="text-xl font-black bg-gradient-to-r from-purple-600 to-teal-500 bg-clip-text text-transparent">Order Details</h1>
          <button onClick={handleOpenChat}
            className="p-2 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-full transition">
            <MessageCircle className="w-6 h-6 text-purple-600" />
          </button>
        </div>
      </motion.div>

      <div className="p-4 pb-24 space-y-4 max-w-4xl mx-auto bg-gray-50 dark:bg-gray-950 min-h-screen">

        {/* LOYALTY REWARD BANNER */}
        {loyaltyReward && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-gradient-to-r from-amber-400 to-orange-400 rounded-2xl p-4 text-white text-center font-bold shadow-lg">
            {loyaltyReward}
          </motion.div>
        )}

        {/* ORDER HEADER */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-gray-400 font-medium">Reference</p>
              <p className="font-black text-gray-800 dark:text-white text-sm mt-0.5">#{order.reference}</p>
              <p className="text-xs text-gray-400 mt-1">{new Date(order.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" })}</p>
            </div>
            <div className={`px-3 py-1.5 rounded-full font-bold text-xs flex items-center gap-1.5 ${statusColor(order.status)}`}>
              {isCompleted ? <CheckCircle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
              {statusLabel(order.status)}
            </div>
          </div>
        </motion.div>

        {/* ESCROW NOTICE */}
        {canConfirm && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl p-4">
            <div className="flex gap-3">
              <Clock className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-900 dark:text-amber-300 text-sm">Payment Held in Escrow</p>
                <p className="text-xs text-amber-800 dark:text-amber-400 mt-1">
                  ₦{parseFloat(String(order.amount)).toLocaleString("en-NG", { minimumFractionDigits: 2 })} is secured.{" "}
                  {order.status === 'seller_completed' ? "Seller marked complete — confirm to release payment." : "Waiting for seller to complete."}
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* COMPLETED NOTICE */}
        {isCompleted && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 rounded-2xl p-4">
            <div className="flex gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-emerald-900 dark:text-emerald-300 text-sm">Order Completed</p>
                <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">Payment has been released to the seller.</p>
              </div>
            </div>
          </motion.div>
        )}

        {/* ORDER INFO */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800">
          <h3 className="font-black text-gray-800 dark:text-white mb-4 flex items-center gap-2">
            <Package className="w-5 h-5 text-purple-600" /> Order Info
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between py-2 border-b border-gray-50 dark:border-gray-800">
              <span className="text-sm text-gray-400">Item</span>
              <span className="font-bold text-gray-800 dark:text-white text-sm">{order.listing?.title}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-50 dark:border-gray-800">
              <span className="text-sm text-gray-400">Seller</span>
              <span className="font-bold text-gray-800 dark:text-white text-sm">{order.listing?.vendor?.username}</span>
            </div>
            <div className="flex justify-between pt-2">
              <span className="font-bold text-gray-700 dark:text-gray-300">Total</span>
              <span className="font-black text-2xl text-purple-600">
                ₦{parseFloat(String(order.amount)).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </motion.div>

        {/* CONFIRM BUTTON */}
        {canConfirm && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="space-y-3">
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={() => setShowModal(true)}
              className="w-full py-4 bg-gradient-to-r from-purple-600 to-teal-500 text-white rounded-2xl font-black text-base shadow-lg flex items-center justify-center gap-2">
              <CheckCircle className="w-5 h-5" /> Confirm Receipt
            </motion.button>
            <button className="w-full py-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-2xl font-bold text-sm border border-red-100 dark:border-red-800">
              Report an Issue
            </button>
          </motion.div>
        )}

        {/* REVIEW FORM */}
        {isCompleted && canReview && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
            <ReviewForm
              orderId={order.id}
              vendorName={order.listing?.vendor?.username}
              onSuccess={() => setCanReview(false)}
            />
          </motion.div>
        )}
      </div>

      {/* CONFIRM MODAL */}
      {showModal && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
          onClick={() => !confirming && setShowModal(false)}>
          <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            className="bg-white dark:bg-gray-900 rounded-3xl p-6 w-full max-w-md shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-black text-gray-900 dark:text-white mb-2">Confirm Receipt?</h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-5">Only confirm if you received the order. This releases payment to the seller.</p>
            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4 mb-5 text-center">
              <p className="text-xs text-gray-400">Amount to release</p>
              <p className="text-3xl font-black text-purple-600 mt-1">
                ₦{parseFloat(String(order.amount)).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-gray-400 mt-1">to {order.listing?.vendor?.username}</p>
            </div>
            <p className="text-xs text-center text-amber-600 dark:text-amber-400 mb-4">
              🎁 Complete 5 orders to earn ₦100 loyalty credits!
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowModal(false)} disabled={confirming}
                className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl font-bold disabled:opacity-50">
                Cancel
              </button>
              <motion.button whileTap={{ scale: 0.97 }} onClick={handleConfirm} disabled={confirming}
                className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-teal-500 text-white rounded-xl font-black disabled:opacity-50 flex items-center justify-center gap-2">
                {confirming
                  ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}><Clock className="w-5 h-5" /></motion.div>
                  : <><CheckCircle className="w-5 h-5" /> Confirm</>}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </>
  );
}
