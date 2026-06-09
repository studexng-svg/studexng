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

function useElapsed(isoDate?: string | null) {
  const [elapsed, setElapsed] = useState("");
  useEffect(() => {
    if (!isoDate) return;
    const update = () => {
      const secs = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
      if (secs < 60) { setElapsed(`${secs}s ago`); return; }
      const mins = Math.floor(secs / 60);
      if (mins < 60) { setElapsed(`${mins}m ago`); return; }
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) { setElapsed(`${hrs}h ${mins % 60}m ago`); return; }
      setElapsed(`${Math.floor(hrs / 24)}d ${hrs % 24}h ago`);
    };
    update();
    const t = setInterval(update, 30_000);
    return () => clearInterval(t);
  }, [isoDate]);
  return elapsed;
}

interface Order {
  id: number;
  reference: string;
  listing: { id: number; title: string; vendor: { id: number; username: string } };
  amount: number;
  created_at: string;
  paid_at?: string | null;
  status: "pending" | "paid" | "seller_completed" | "completed" | "disputed" | "cancelled";
  current_status: string;
  delivery_location?: string;
  delivery_proof_1?: string | null;
  delivery_proof_2?: string | null;
}

interface LoyaltyStatus {
  total_completed_orders: number;
  orders_until_next_reward: number;
  credit_balance: number;
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
  const [loyalty, setLoyalty] = useState<LoyaltyStatus | null>(null);
  const [justConfirmed, setJustConfirmed] = useState(false);
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputeReason, setDisputeReason] = useState("service_not_completed");
  const [disputeComplaint, setDisputeComplaint] = useState("");
  const [disputeEvidence, setDisputeEvidence] = useState("");
  const [disputing, setDisputing] = useState(false);
  const [disputeError, setDisputeError] = useState("");
  const elapsed = useElapsed(order?.paid_at || order?.created_at);

  const fetchLoyalty = async () => {
    try {
      const r = await fetchWithAuth(`${API_URL}/api/loyalty/status/`);
      if (r.ok) setLoyalty(await r.json());
    } catch {}
  };

  useEffect(() => {
    if (isHydrated && !isLoggedIn) { router.push("/auth"); return; }
    if (!isHydrated || !isLoggedIn) return;

    fetchLoyalty();

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
        setJustConfirmed(true);
        if (data.loyalty_reward?.awarded) setLoyaltyReward(data.loyalty_reward.message);
        setShowModal(false);
        fetchLoyalty();
      } else { alert("Failed to confirm. Please try again."); }
    } catch { alert("Network error."); }
    finally { setConfirming(false); }
  };

  const handleDisputeSubmit = async () => {
    if (!order || !disputeComplaint.trim()) return;
    setDisputing(true);
    setDisputeError("");
    try {
      const res = await fetchWithAuth(`${API_URL}/api/orders/disputes/`, {
        method: "POST",
        body: JSON.stringify({
          order: order.id,
          reason: disputeReason,
          complaint: disputeComplaint.trim(),
          evidence: disputeEvidence.trim(),
        }),
      });
      if (res.ok) {
        setOrder(prev => prev ? { ...prev, status: "disputed" } : null);
        setShowDisputeModal(false);
      } else {
        const data = await res.json();
        const msg = data.non_field_errors?.[0] || data.detail || "Failed to submit dispute.";
        setDisputeError(msg);
      }
    } catch { setDisputeError("Network error. Please try again."); }
    finally { setDisputing(false); }
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

  const canConfirm = order.status === "seller_completed";
  const awaitingVendor = order.status === "paid";
  const isCompleted = order.status === "completed";
  const isCancelled = order.status === "cancelled" || order.current_status === "cancelled";

  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <TopNav showBack />

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
                {new Date(order.paid_at || order.created_at).toLocaleString("en-NG", {
                  day: "numeric", month: "short", year: "numeric",
                  hour: "2-digit", minute: "2-digit",
                })}
                {elapsed && <span className="ml-1 text-stone-300">({elapsed})</span>}
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

        {/* DISPUTED NOTICE */}
        {order.status === "disputed" && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 animate-fadeUp">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-900 text-sm">Dispute Filed</p>
                <p className="text-xs text-red-700 mt-1">
                  Your dispute is under review. Our team will reach out with a resolution.
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
                  {justConfirmed
                    ? `Payment has been released to ${order.listing?.vendor?.username}. Thank you!`
                    : `Payment has been released to ${order.listing?.vendor?.username}.`}
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

        {/* DELIVERY PROOF */}
        {(order.delivery_proof_1 || order.delivery_proof_2) && (
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-stone-200 animate-fadeUp">
            <h3 className="font-semibold text-stone-800 mb-3 flex items-center gap-2 text-sm">
              <Package className="w-4 h-4 text-teal-600" /> Delivery Proof
            </h3>
            <div className="flex gap-3">
              {[order.delivery_proof_1, order.delivery_proof_2].filter(Boolean).map((url, i) => (
                <a key={i} href={url!} target="_blank" rel="noopener noreferrer"
                  className="flex-1 max-w-[140px] aspect-square rounded-xl overflow-hidden border border-stone-200 block">
                  <img src={url!} alt={`Delivery proof ${i + 1}`} className="w-full h-full object-cover" />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* LOYALTY PROGRESS */}
        {loyalty && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-stone-200 animate-fadeUp">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-stone-700">🎁 Loyalty Rewards</p>
              <p className="text-xs text-teal-600 font-bold">
                {loyalty.total_completed_orders % 10}/10 orders
              </p>
            </div>
            <div className="w-full bg-stone-100 rounded-full h-2 mb-2">
              <div
                className="h-2 rounded-full transition-all duration-500"
                style={{ width: `${((loyalty.total_completed_orders % 10) / 10) * 100}%`, background: "linear-gradient(90deg,#0d9488,#7c3aed)" }}
              />
            </div>
            <p className="text-xs text-stone-400">
              {loyalty.orders_until_next_reward === 0
                ? "You just earned ₦200!"
                : `${loyalty.orders_until_next_reward} more order${loyalty.orders_until_next_reward === 1 ? "" : "s"} to earn ₦200 credits`}
              {loyalty.credit_balance > 0 && (
                <span className="ml-2 text-teal-600 font-semibold">· Balance: ₦{Number(loyalty.credit_balance).toLocaleString()}</span>
              )}
            </p>
          </div>
        )}

        {/* CONFIRM BUTTON */}
        {(canConfirm || awaitingVendor) && (
          <div className="space-y-3 animate-fadeUp">
            {awaitingVendor ? (
              <div className="w-full py-4 bg-stone-100 text-stone-400 rounded-full font-semibold text-base flex items-center justify-center gap-2 cursor-not-allowed select-none">
                <Clock className="w-5 h-5" /> Waiting for vendor to confirm delivery
              </div>
            ) : (
              <button
                onClick={() => setShowModal(true)}
                className="w-full py-4 text-white rounded-full font-semibold text-base shadow-lg flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                style={{ background: GRAD }}
              >
                <CheckCircle className="w-5 h-5" /> Confirm Service Received
              </button>
            )}
            <button
              onClick={() => setShowDisputeModal(true)}
              className="w-full py-3 bg-red-50 text-red-600 rounded-full font-semibold text-sm border border-red-100 active:scale-[0.98] transition-all"
            >
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

      {/* DISPUTE MODAL */}
      {showDisputeModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4 animate-fadeIn"
          onClick={() => !disputing && setShowDisputeModal(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border border-stone-100 mb-20 sm:mb-0 animate-fadeUp"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-stone-900 mb-1">Report an Issue</h3>
            <p className="text-stone-500 text-sm mb-5">
              Describe the problem with your order. Our team will review and follow up.
            </p>

            {disputeError && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600 font-medium">
                {disputeError}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-stone-500 mb-1.5 block">Reason</label>
                <select
                  value={disputeReason}
                  onChange={e => setDisputeReason(e.target.value)}
                  disabled={disputing}
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 transition appearance-none disabled:opacity-50"
                >
                  <option value="service_not_completed">Service Not Completed</option>
                  <option value="quality_issue">Quality Issue</option>
                  <option value="provider_no_show">Provider No-Show</option>
                  <option value="late_delivery">Late Delivery</option>
                  <option value="wrong_service">Wrong Service Delivered</option>
                  <option value="payment_issue">Payment Issue</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-stone-500 mb-1.5 block">
                  Describe the issue <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={disputeComplaint}
                  onChange={e => setDisputeComplaint(e.target.value)}
                  disabled={disputing}
                  rows={4}
                  placeholder="What happened? Be as specific as possible..."
                  className="w-full px-4 py-3 rounded-xl border border-stone-200 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 bg-white placeholder:text-stone-400 resize-none transition disabled:opacity-50"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-stone-500 mb-1.5 block">
                  Evidence <span className="text-stone-300">(optional)</span>
                </label>
                <textarea
                  value={disputeEvidence}
                  onChange={e => setDisputeEvidence(e.target.value)}
                  disabled={disputing}
                  rows={2}
                  placeholder="Describe any evidence (screenshots, chat messages, etc.)..."
                  className="w-full px-4 py-3 rounded-xl border border-stone-200 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 bg-white placeholder:text-stone-400 resize-none transition disabled:opacity-50"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowDisputeModal(false)}
                disabled={disputing}
                className="flex-1 py-3 bg-stone-100 text-stone-700 rounded-full font-semibold disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDisputeSubmit}
                disabled={disputing || !disputeComplaint.trim()}
                className="flex-1 py-3 bg-red-500 text-white rounded-full font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {disputing
                  ? <div className="animate-spin"><Clock className="w-5 h-5" /></div>
                  : <><AlertCircle className="w-5 h-5" /> Submit Dispute</>}
              </button>
            </div>
          </div>
        </div>
      )}

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
              {loyalty
                ? loyalty.orders_until_next_reward === 1
                  ? "🎁 This is your last order before earning ₦200 loyalty credits!"
                  : loyalty.orders_until_next_reward === 0
                  ? "🎉 You just hit a milestone — ₦200 credits incoming!"
                  : `🎁 ${loyalty.orders_until_next_reward} more orders to earn ₦200 loyalty credits`
                : "🎁 Complete 10 orders to earn ₦200 loyalty credits"}
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
