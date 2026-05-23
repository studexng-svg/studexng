"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Package, CheckCircle, Clock, AlertCircle, MessageCircle, XCircle, MapPin,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth, fetchWithAuth } from "@/lib/authStore";
import { GRAD, SERIF } from "@/lib/tokens";
import ReviewForm from "@/components/ReviewForm";
import TopNav from "@/components/layout/TopNav";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";


interface Order {
  id: number;
  reference: string;
  listing: { id: number; title: string; vendor: { id: number; username: string } };
  amount: number;
  created_at: string;
  status: "pending" | "paid" | "seller_completed" | "completed" | "disputed" | "cancelled";
  current_status: string;
  delivery_location?: string;
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
        const orderRes = await fetchWithAuth(`${API_URL}/api/orders/orders/${orderId}/`);
        if (orderRes.status === 404) { setError("not_found"); return; }
        if (!orderRes.ok) throw new Error();
        const data = await orderRes.json();
        setOrder(data);
        if (data.status === "completed") {
          const rv = await fetchWithAuth(`${API_URL}/api/reviews/reviews/can-review/${orderId}/`);
          if (rv.ok) { const d = await rv.json(); setCanReview(d.can_review); }
        }
      } catch { setError("failed"); }
      finally { setLoading(false); }
    };
    load();

    const interval = setInterval(async () => {
      try {
        const res = await fetchWithAuth(`${API_URL}/api/orders/orders/${orderId}/`);
        if (res.ok) setOrder(await res.json());
      } catch {}
    }, 15000);
    return () => clearInterval(interval);
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
        body: JSON.stringify({ listing_id: order.listing?.id, seller_id: order.listing?.vendor?.id }),
      });
      if (res.ok) { const data = await res.json(); router.push(`/chat/${data.id}`); }
    } catch { router.push("/chat"); }
  };

  const statusColor = (s: string) => ({
    paid: "bg-amber-100 text-amber-700",
    seller_completed: "bg-blue-100 text-blue-700",
    completed: "bg-emerald-100 text-emerald-700",
    disputed: "bg-red-100 text-red-700",
    cancelled: "bg-stone-100 text-stone-500",
  }[s] || "bg-stone-100 text-stone-500");

  const statusLabel = (s: string) => ({
    pending: "Pending Payment",
    paid: "In Progress",
    seller_completed: "Ready — Confirm Receipt",
    completed: "Completed",
    disputed: "Disputed",
    cancelled: "Cancelled",
  }[s] || s);

  if (!isHydrated || loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F5F5]">
      <div className="animate-spin"><Clock className="w-10 h-10 text-teal-600" /></div>
    </div>
  );

  if (error === "not_found" || !order) return (
    <div className="min-h-screen bg-[#F5F5F5] flex items-center justify-center p-6">
      <div className="text-center bg-white rounded-2xl p-8 shadow-sm border border-stone-200">
        <AlertCircle className="w-14 h-14 text-red-500 mx-auto mb-3" />
        <h2 className="text-xl font-bold text-stone-800 mb-2">Order Not Found</h2>
        <Link href="/account/orders">
          <button className="mt-4 px-6 py-3 text-white font-semibold rounded-full" style={{ background: GRAD }}>
            Back to Orders
          </button>
        </Link>
      </div>
    </div>
  );

  const canConfirm = order.status === "paid" || order.status === "seller_completed";
  const isCompleted = order.status === "completed";
  const isCancelled = order.status === "cancelled" || order.current_status === "cancelled";

  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <TopNav showBack backHref="/account/orders" />

      <div className="px-4 pt-6 pb-24 space-y-4 max-w-4xl mx-auto">
        <div className="flex justify-end">
          <button onClick={handleOpenChat} className="flex items-center gap-1.5 px-4 py-2 bg-white border border-stone-200 rounded-full shadow-sm text-sm font-semibold text-teal-600 hover:border-teal-300 transition">
            <MessageCircle className="w-4 h-4" /> Chat Vendor
          </button>
        </div>

        {/* LOYALTY REWARD BANNER */}
        {loyaltyReward && (
          <div className="bg-gradient-to-r from-amber-400 to-orange-400 rounded-2xl p-4 text-white text-center font-semibold shadow-lg animate-fadeUp">
            {loyaltyReward}
          </div>
        )}

        {/* ORDER HEADER */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-stone-200 animate-fadeUp">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-stone-400 font-medium">Reference</p>
              <p className="font-semibold text-stone-800 text-sm mt-0.5">#{order.reference}</p>
              <p className="text-xs text-stone-400 mt-1">
                {new Date(order.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" })}
              </p>
            </div>
            <div className={`px-3 py-1.5 rounded-full font-semibold text-xs flex items-center gap-1.5 ${statusColor(order.status)}`}>
              {isCompleted ? <CheckCircle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
              {statusLabel(order.status)}
            </div>
          </div>
        </div>

        {isCancelled && (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-4 animate-fadeUp">
            <div className="flex gap-3">
              <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-900 text-sm">Order Cancelled</p>
                <p className="text-xs text-red-700 mt-1">This order was cancelled. Contact support if you need help.</p>
              </div>
            </div>
          </div>
        )}

        {/* SELLER COMPLETED NOTICE */}
        {order.status === "seller_completed" && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 animate-fadeUp">
            <div className="flex gap-3">
              <Clock className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-900 text-sm">Awaiting Your Confirmation</p>
                <p className="text-xs text-amber-800 mt-1">
                  The vendor has delivered your order — please confirm below to release their payment.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* COMPLETED NOTICE */}
        {isCompleted && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 animate-fadeUp">
            <div className="flex gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-emerald-900 text-sm">Order Completed ✓</p>
                <p className="text-xs text-emerald-700 mt-1">
                  The vendor will receive their payment shortly.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ORDER INFO */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-stone-200 animate-fadeUp">
          <h3 className="font-semibold text-stone-800 mb-4 flex items-center gap-2">
            <Package className="w-5 h-5 text-teal-600" /> Order Info
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between py-2 border-b border-stone-50">
              <span className="text-sm text-stone-400">Item</span>
              <span className="font-semibold text-stone-800 text-sm">{order.listing?.title}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-stone-50">
              <span className="text-sm text-stone-400">Vendor</span>
              <span className="font-semibold text-stone-800 text-sm">{order.listing?.vendor?.username}</span>
            </div>
              <div className="flex items-start gap-2 py-2 border-b border-stone-50">
                <MapPin className="w-4 h-4 text-teal-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-stone-400 mb-0.5">Delivery Location</p>
                  <p className="font-semibold text-stone-800 text-sm">
                    {order.delivery_location || <span className="text-stone-400 italic font-normal">Not set</span>}
                  </p>
                </div>
              </div>
            <div className="flex justify-between pt-2">
              <span className="font-semibold text-stone-700">Total</span>
              <span className="font-bold text-2xl text-teal-700">
                ₦{parseFloat(String(order.amount)).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        {/* CONFIRM BUTTON */}
        {canConfirm && (
          <div className="space-y-3 animate-fadeUp">
            <button
              onClick={() => setShowModal(true)}
              className="w-full py-4 text-white rounded-full font-semibold text-base shadow-lg flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
              style={{ background: GRAD }}
            >
              <CheckCircle className="w-5 h-5" /> Confirm Service Received
            </button>
            <button className="w-full py-3 bg-red-50 text-red-600 rounded-full font-semibold text-sm border border-red-100">
              Report an Issue
            </button>
          </div>
        )}

        {/* REVIEW FORM */}
        {isCompleted && canReview && (
          <div className="animate-fadeUp">
            <ReviewForm orderId={order.id} vendorName={order.listing?.vendor?.username} onSuccess={() => setCanReview(false)} />
          </div>
        )}
      </div>

      {/* CONFIRM MODAL */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4 animate-fadeIn"
          onClick={() => !confirming && setShowModal(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border border-stone-100 mb-20 sm:mb-0 animate-fadeUp"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-stone-900 mb-2">Confirm Service Received?</h3>
            <p className="text-stone-500 text-sm mb-5">
              Only confirm if the vendor delivered the service. This releases the payment.
            </p>
            <div className="bg-teal-50 rounded-xl p-4 mb-5 text-center">
              <p className="text-xs text-stone-400">Amount paid</p>
              <p className="text-3xl font-bold text-teal-700 mt-1">
                ₦{parseFloat(String(order.amount)).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-stone-400 mt-1">to {order.listing?.vendor?.username}</p>
            </div>
            <p className="text-xs text-center text-amber-600 mb-4">
              🎁 Complete 10 orders to earn ₦200 loyalty credits!
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowModal(false)} disabled={confirming}
                className="flex-1 py-3 bg-stone-100 text-stone-700 rounded-full font-semibold disabled:opacity-50">
                Cancel
              </button>
              <button onClick={handleConfirm} disabled={confirming}
                className="flex-1 py-3 text-white rounded-full font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: GRAD }}>
                {confirming
                  ? <div className="animate-spin"><Clock className="w-5 h-5" /></div>
                  : <><CheckCircle className="w-5 h-5" /> Confirm</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
