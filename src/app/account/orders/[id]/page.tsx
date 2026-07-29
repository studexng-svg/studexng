"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Package, CheckCircle, Clock, AlertCircle, MessageCircle, XCircle, MapPin, Timer,
  Camera, ImagePlus, X, Lock, Truck,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/authStore";
import { TEAL, PURPLE } from "@/lib/tokens";
import ReviewForm from "@/components/ReviewForm";
import TopNav from "@/components/layout/TopNav";
import { api } from "@/lib/api";
import { escrowStatusLabel } from "@/lib/orderStatusLabels";
import OrderTimeline from "@/components/orders/OrderTimeline";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const AUTO_RELEASE_HOURS = 24;

function useAutoReleaseCountdown(sellerCompletedAt?: string | null) {
  const [remaining, setRemaining] = useState<{ h: number; m: number; s: number; expired: boolean } | null>(null);
  useEffect(() => {
    if (!sellerCompletedAt) return;
    const deadline = new Date(sellerCompletedAt).getTime() + AUTO_RELEASE_HOURS * 60 * 60 * 1000;
    const update = () => {
      const diff = deadline - Date.now();
      if (diff <= 0) { setRemaining({ h: 0, m: 0, s: 0, expired: true }); return; }
      const total = Math.floor(diff / 1000);
      setRemaining({ h: Math.floor(total / 3600), m: Math.floor((total % 3600) / 60), s: total % 60, expired: false });
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [sellerCompletedAt]);
  return remaining;
}

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

interface OrderLineItem {
  id: number;
  listing_title: string;
  image: string | null;
  quantity: number;
  unit_price: string;
  line_total: string;
  status: "fulfilled" | "unavailable";
  addons: { name: string; price_delta: string; quantity: number }[];
}

interface Order {
  id: number;
  reference: string;
  listing: { id: number; title: string; image: string | null; vendor: { id: number; username: string } };
  amount: number;
  items?: OrderLineItem[];
  created_at: string;
  paid_at?: string | null;
  vendor_accepted_at?: string | null;
  service_started_at?: string | null;
  seller_completed_at?: string | null;
  status: "pending" | "paid" | "seller_completed" | "completed" | "disputed" | "cancelled" | "vendor_declined";
  current_status: string;
  delivery_location?: string;
  delivery_proof_1?: string | null;
  delivery_proof_2?: string | null;
  has_rider_delivery?: boolean;
}

interface DeliveryStatus {
  rider_username: string;
  status: "assigned" | "picked_up" | "at_pickup_point" | "completed";
  pickup_point_name?: string;
  pickup_point_campus?: string;
  delivery_code: string | null;
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
  const queryClient = useQueryClient();
  const orderId = params.id as string;

  const [confirming, setConfirming] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [loyaltyReward, setLoyaltyReward] = useState<string | null>(null);
  const [justConfirmed, setJustConfirmed] = useState(false);
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputeReason, setDisputeReason] = useState("service_not_completed");
  const [disputeComplaint, setDisputeComplaint] = useState("");
  const [disputeEvidence, setDisputeEvidence] = useState("");
  const [disputing, setDisputing] = useState(false);
  const [disputeError, setDisputeError] = useState("");
  const [disputeSuccess, setDisputeSuccess] = useState(false);
  const [disputeImages, setDisputeImages] = useState<(File | null)[]>([null, null]);
  const [disputePreviews, setDisputePreviews] = useState<(string | null)[]>([null, null]);
  const disputeImgRef1 = useRef<HTMLInputElement>(null);
  const disputeImgRef2 = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isHydrated && !isLoggedIn) router.push("/auth");
  }, [isHydrated, isLoggedIn, router]);

  const { data: order, isPending, isError, error } = useQuery<Order, Error>({
    queryKey: ["order", orderId],
    queryFn: async () => {
      const res = await api.orders.get(orderId);
      if (res.status === 404) throw new Error("not_found");
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
    enabled: isHydrated && isLoggedIn && !!orderId,
    refetchInterval: 15_000,
    staleTime: 10_000,
    retry: (_, err) => err.message !== "not_found",
  });

  const { data: loyalty } = useQuery<LoyaltyStatus>({
    queryKey: ["loyalty-status"],
    queryFn: async () => {
      const r = await api.loyalty.status();
      if (!r.ok) throw new Error("loyalty fetch failed");
      return r.json();
    },
    enabled: isHydrated && isLoggedIn,
    staleTime: 30_000,
  });

  const { data: deliveryStatus } = useQuery<DeliveryStatus>({
    queryKey: ["delivery-status", orderId],
    queryFn: async () => {
      const r = await api.delivery.orderStatus(orderId);
      if (!r.ok) throw new Error("delivery status fetch failed");
      return r.json();
    },
    enabled: isHydrated && isLoggedIn && !!order?.has_rider_delivery && order?.status === "paid",
    refetchInterval: 10_000,
    staleTime: 5_000,
    retry: false,
  });

  const { data: canReviewData } = useQuery<{ can_review: boolean }>({
    queryKey: ["can-review", orderId],
    queryFn: async () => {
      const rv = await api.reviews.canReview(orderId);
      if (!rv.ok) return { can_review: false };
      return rv.json();
    },
    enabled: isHydrated && isLoggedIn && !!order && order.status === "completed",
    staleTime: 60_000,
  });

  const canReview = canReviewData?.can_review ?? false;
  const elapsed = useElapsed(order?.paid_at || order?.created_at);
  const countdown = useAutoReleaseCountdown(
    order?.status === "seller_completed" ? order.seller_completed_at : null
  );

  const handleConfirm = async () => {
    if (!order) return;
    setConfirming(true);
    try {
      const res = await api.orders.confirm(orderId);
      if (res.ok) {
        const data = await res.json();
        queryClient.setQueryData<Order>(["order", orderId], prev =>
          prev ? { ...prev, status: "completed" } : prev
        );
        queryClient.setQueryData(["can-review", orderId], { can_review: true });
        setJustConfirmed(true);
        if (data.loyalty_reward?.awarded) setLoyaltyReward(data.loyalty_reward.message);
        setShowModal(false);
        queryClient.invalidateQueries({ queryKey: ["loyalty-status"] });
      } else { alert("Failed to confirm. Please try again."); }
    } catch { alert("Network error."); }
    finally { setConfirming(false); }
  };

  const resetDisputeModal = () => {
    setDisputeComplaint("");
    setDisputeEvidence("");
    setDisputeError("");
    setDisputeSuccess(false);
    setDisputeImages([null, null]);
    disputePreviews.forEach(p => { if (p) URL.revokeObjectURL(p); });
    setDisputePreviews([null, null]);
  };

  const pickDisputeImage = (idx: number, file: File) => {
    const imgs = [...disputeImages]; imgs[idx] = file;
    const prevs = [...disputePreviews];
    if (prevs[idx]) URL.revokeObjectURL(prevs[idx]!);
    prevs[idx] = URL.createObjectURL(file);
    setDisputeImages(imgs); setDisputePreviews(prevs);
  };

  const removeDisputeImage = (idx: number) => {
    const imgs = [...disputeImages]; imgs[idx] = null;
    const prevs = [...disputePreviews];
    if (prevs[idx]) URL.revokeObjectURL(prevs[idx]!);
    prevs[idx] = null;
    setDisputeImages(imgs); setDisputePreviews(prevs);
  };

  const handleDisputeSubmit = async () => {
    if (!order || !disputeComplaint.trim() || !disputeEvidence.trim() || !disputeImages[0]) return;
    setDisputing(true);
    setDisputeError("");
    try {
      const fd = new FormData();
      fd.append("order", String(order.id));
      fd.append("reason", disputeReason);
      fd.append("complaint", disputeComplaint.trim());
      fd.append("evidence", disputeEvidence.trim());
      if (disputeImages[0]) fd.append("evidence_image_1", disputeImages[0]);
      if (disputeImages[1]) fd.append("evidence_image_2", disputeImages[1]);
      const res = await api.orders.createDispute(fd);
      if (res.ok) {
        queryClient.setQueryData<Order>(["order", orderId], prev =>
          prev ? { ...prev, status: "disputed" } : prev
        );
        setDisputeSuccess(true);
        setTimeout(() => {
          resetDisputeModal();
          setShowDisputeModal(false);
        }, 2000);
      } else {
        let msg = "Failed to submit dispute.";
        try {
          const data = await res.json();
          msg = data.non_field_errors?.[0]
            || data.detail
            || Object.values(data).flat().find((v): v is string => typeof v === "string")
            || msg;
        } catch {}
        setDisputeError(msg);
      }
    } catch { setDisputeError("Network error. Please try again."); }
    finally { setDisputing(false); }
  };

  const handleOpenChat = async () => {
    if (!order) return;
    try {
      const res = await api.chat.start({ listing_id: order.listing?.id, seller_id: order.listing?.vendor?.id });
      if (res.ok) { const data = await res.json(); router.push(`/chat/${data.id}`); }
    } catch { router.push("/chat"); }
  };


  const statusColor = (s: string) => ({
    paid: "bg-amber-100 text-amber-700",
    seller_completed: "bg-blue-100 text-blue-700",
    completed: "bg-emerald-100 text-emerald-700",
    disputed: "bg-red-100 text-red-700",
    cancelled: "bg-stone-100 text-stone-500",
    vendor_declined: "bg-stone-100 text-stone-500",
  }[s] || "bg-stone-100 text-stone-500");

  if (!isHydrated || isPending) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F5F5]">
      <div className="animate-spin"><Clock className="w-10 h-10 text-teal-600" /></div>
    </div>
  );

  if (isError || !order) return (
    <div className="min-h-screen bg-[#F5F5F5] flex items-center justify-center p-6">
      <div className="text-center bg-white rounded-2xl p-8 shadow-sm border border-stone-200">
        <AlertCircle className="w-14 h-14 text-red-500 mx-auto mb-3" />
        <h2 className="text-xl font-bold text-stone-800 mb-2">Order Not Found</h2>
        <Link href="/account/orders">
          <button className="mt-4 px-6 py-3 text-white font-semibold rounded-full" style={{ background: TEAL }}>
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
  // Chat is payment-gated (see chat/views.py ConversationViewSet) — locked before payment,
  // available while active, and read-only (expired) once the order is fully completed.
  const chatLocked = order.status === "pending" || order.status === "vendor_declined";

  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <TopNav showBack />

      <div className="px-4 pt-6 pb-24 space-y-4 max-w-4xl mx-auto">
        <div className="flex justify-end">
          {chatLocked ? (
            <button
              disabled
              title="Chat becomes available after payment to protect both buyers and vendors."
              className="flex items-center gap-1.5 px-4 py-2 bg-white border border-stone-200 rounded-full shadow-sm text-sm font-semibold text-stone-400 cursor-not-allowed"
            >
              <Lock className="w-4 h-4" /> Chat Locked
            </button>
          ) : (
            <button onClick={handleOpenChat} className="flex items-center gap-1.5 px-4 py-2 bg-white border border-stone-200 rounded-full shadow-sm text-sm font-semibold text-teal-600 hover:border-teal-300 transition">
              <MessageCircle className="w-4 h-4" /> {isCompleted ? "View Chat (Ended)" : "Chat Vendor"}
            </button>
          )}
        </div>

        {/* LOYALTY REWARD BANNER */}
        {loyaltyReward && (
          <div className="bg-gradient-to-r from-amber-400 to-orange-400 rounded-2xl p-4 text-white text-center font-semibold shadow-lg animate-fadeUp">
            {loyaltyReward}
          </div>
        )}

        {/* ORDER SUMMARY — one joined card, internal dividers instead of separate boxes */}
        <div className="bg-white rounded-2xl shadow-sm border border-stone-200 divide-y divide-stone-100 overflow-hidden animate-fadeUp">
          {/* ORDER HEADER */}
          <div className="p-5">
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
                {escrowStatusLabel(order)}
              </div>
            </div>
          </div>

          {/* ORDER TIMELINE */}
          <div className="p-5">
            <p className="text-xs text-stone-400 font-bold uppercase tracking-wide mb-4">Order Timeline</p>
            <OrderTimeline orderId={order.id} />
          </div>

          {/* ITEMS IN YOUR ORDER */}
          <div className="p-5">
            <h3 className="font-semibold text-stone-800 mb-4 flex items-center gap-2">
              <Package className="w-5 h-5 text-teal-600" /> Items in Your Order
            </h3>
            <div className="space-y-3">
              {order.items && order.items.length > 0 ? (
                order.items.map(item => (
                  <div key={item.id} className="flex gap-3 pb-3 border-b border-stone-50 last:border-0 last:pb-0">
                    <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-stone-100">
                      {item.image ? (
                        <img src={item.image} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="w-5 h-5 text-stone-300" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <p className={`text-sm font-medium ${item.status === "unavailable" ? "text-stone-400 line-through" : "text-stone-800"}`}>
                          {item.listing_title} × {item.quantity}
                        </p>
                        {item.addons.length > 0 && (
                          <p className="text-xs text-stone-400">{item.addons.map(a => a.quantity > 1 ? `${a.name} ×${a.quantity}` : a.name).join(", ")}</p>
                        )}
                        {item.status === "unavailable" && (
                          <p className="text-xs text-red-500 font-medium">Unavailable — refunded</p>
                        )}
                      </div>
                      <span className="font-semibold text-stone-700 text-sm flex-shrink-0">
                        ₦{parseFloat(item.line_total).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex gap-3">
                  <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-stone-100">
                    {order.listing?.image ? (
                      <img src={order.listing.image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className="w-5 h-5 text-stone-300" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 flex justify-between items-center gap-2">
                    <span className="font-semibold text-stone-800 text-sm">{order.listing?.title}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* DELIVERY INFORMATION */}
          <div className="p-5">
            <h3 className="font-semibold text-stone-800 mb-4 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-teal-600" /> Delivery Information
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-stone-50">
                <span className="text-sm text-stone-400">Vendor</span>
                <span className="font-semibold text-stone-800 text-sm">{order.listing?.vendor?.username}</span>
              </div>
              <div className="py-2">
                <p className="text-xs text-stone-400 mb-0.5">Delivery Location</p>
                <p className="font-semibold text-stone-800 text-sm">
                  {order.delivery_location || <span className="text-stone-400 italic font-normal">Not set</span>}
                </p>
              </div>
            </div>
          </div>

          {/* PAYMENT INFORMATION */}
          <div className="p-5">
            <h3 className="font-semibold text-stone-800 mb-4 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-teal-600" /> Payment Information
            </h3>
            <div className="flex justify-between items-center">
              <span className="font-semibold text-stone-700">Total Paid</span>
              <span className="font-bold text-2xl text-teal-700">
                ₦{parseFloat(String(order.amount)).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* DELIVERY PROOF */}
          {(order.delivery_proof_1 || order.delivery_proof_2) && (
            <div className="p-5">
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
            <div className="p-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-stone-700">🎁 Loyalty Rewards</p>
                <p className="text-xs font-bold" style={{ color: PURPLE }}>
                  {loyalty.total_completed_orders % 10}/10 orders
                </p>
              </div>
              <div className="w-full bg-stone-100 rounded-full h-2 mb-2">
                <div
                  className="h-2 rounded-full transition-all duration-500"
                  style={{ width: `${((loyalty.total_completed_orders % 10) / 10) * 100}%`, background: PURPLE }}
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

          {/* RIDER DELIVERY STATUS + HANDOFF CODE */}
          {awaitingVendor && deliveryStatus && (
            <div className="p-5 space-y-3">
              <div className="flex items-center gap-2 text-sm text-stone-700">
                <Truck className="w-4 h-4 text-teal-600 flex-shrink-0" />
                <span>Rider <span className="font-semibold">@{deliveryStatus.rider_username}</span> {
                  deliveryStatus.status === "assigned" ? "is heading to the vendor"
                  : deliveryStatus.status === "picked_up" ? "has picked up your order"
                  : "has arrived with your order"
                }</span>
              </div>
              {deliveryStatus.status === "at_pickup_point" && deliveryStatus.delivery_code && (
                <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 text-center">
                  <p className="text-xs text-teal-700 font-semibold mb-1">Give this code to the rider to receive your order</p>
                  <p className="text-2xl font-black tracking-[0.3em] text-teal-900">{deliveryStatus.delivery_code}</p>
                </div>
              )}
            </div>
          )}
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

        {/* SELLER COMPLETED NOTICE + AUTO-RELEASE COUNTDOWN */}
        {order.status === "seller_completed" && (
          <div className="bg-amber-50 border-2 border-amber-400 rounded-2xl p-4 animate-fadeUp shadow-sm">
            <div className="flex gap-3">
              <Timer className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-amber-900 text-sm">Action Required — Confirm Your Delivery</p>
                <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                  The vendor has marked this order as delivered. Please confirm receipt below or raise a dispute.
                  If you take no action, <span className="font-semibold">payment will automatically be released to the vendor.</span>
                </p>
                <div className="mt-3">
                  {countdown && !countdown.expired ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-amber-700">Auto-release in:</span>
                      <div className="flex gap-1.5">
                        {[
                          { val: countdown.h, label: "h" },
                          { val: countdown.m, label: "m" },
                          { val: countdown.s, label: "s" },
                        ].map(({ val, label }) => (
                          <span
                            key={label}
                            className="bg-amber-200 text-amber-900 text-xs font-mono font-bold px-2 py-1 rounded-lg min-w-[34px] text-center tabular-nums"
                          >
                            {String(val).padStart(2, "0")}{label}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : countdown?.expired ? (
                    <p className="text-xs font-semibold text-amber-700 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5" /> Time expired — funds will be released shortly.
                    </p>
                  ) : (
                    <p className="text-xs text-amber-700">You have {AUTO_RELEASE_HOURS} hours from delivery confirmation to respond.</p>
                  )}
                </div>
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

        {/* PRE-CONFIRM WARNING */}
        {canConfirm && (
          <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-4 animate-fadeUp">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-red-900 text-sm">Check the proof carefully before confirming</p>
                <p className="text-xs text-red-700 mt-1 leading-relaxed">
                  Once you confirm, payment is released to the vendor <span className="font-bold">immediately and cannot be reversed</span>. After confirming, you will no longer be able to file a dispute yourself. If anything looks wrong with the delivery proof above, tap <span className="font-bold">Report an Issue</span> instead.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* CONFIRM BUTTON */}
        {canConfirm && (
          <div className="flex gap-3 animate-fadeUp">
            <button
              onClick={() => { resetDisputeModal(); setShowDisputeModal(true); }}
              className="flex-1 py-4 bg-red-50 text-red-600 rounded-full font-semibold text-sm border border-red-200 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
            >
              <AlertCircle className="w-4 h-4" /> Report Issue
            </button>
            <button
              onClick={() => { setAcknowledged(false); setShowModal(true); }}
              className="flex-1 py-4 text-white rounded-full font-semibold text-sm shadow-lg flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all"
              style={{ background: TEAL }}
            >
              <CheckCircle className="w-4 h-4" /> Confirm
            </button>
          </div>
        )}

        {awaitingVendor && (
          <div className="space-y-3 animate-fadeUp">
            <div className="w-full py-4 bg-stone-100 text-stone-400 rounded-full font-semibold text-base flex items-center justify-center gap-2 cursor-not-allowed select-none">
              <Clock className="w-5 h-5" />
              {order?.has_rider_delivery ? "Your order is being prepared" : "Waiting for vendor to confirm delivery"}
            </div>
            <button
              onClick={() => { resetDisputeModal(); setShowDisputeModal(true); }}
              className="w-full py-3 bg-red-50 text-red-600 rounded-full font-semibold text-sm border border-red-100 active:scale-[0.98] transition-all"
            >
              Report an Issue
            </button>
          </div>
        )}

        {/* REVIEW FORM */}
        {isCompleted && canReview && (
          <div className="animate-fadeUp">
            <ReviewForm
              orderId={order.id}
              vendorName={order.listing?.vendor?.username}
              onSuccess={() => queryClient.setQueryData(["can-review", orderId], { can_review: false })}
            />
          </div>
        )}
      </div>

      {/* DISPUTE MODAL */}
      {showDisputeModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center px-4 py-20 animate-fadeIn"
          onClick={() => { if (!disputing) { resetDisputeModal(); setShowDisputeModal(false); } }}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden animate-fadeUp"
            style={{ maxHeight: "calc(100dvh - 10rem)" }}
            onClick={e => e.stopPropagation()}
          >
            {/* Fixed header */}
            <div className="px-5 pt-5 pb-3 border-b border-stone-100 shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-stone-900 leading-tight">Report an Issue</h3>
                  <p className="text-stone-400 text-xs mt-0.5">Our team will review and follow up.</p>
                </div>
                <button
                  onClick={() => { resetDisputeModal(); setShowDisputeModal(false); }}
                  disabled={disputing}
                  className="p-2 rounded-full text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition disabled:opacity-40"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              {disputeError && (
                <div className="mt-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600 font-medium">
                  {disputeError}
                </div>
              )}
            </div>

            {/* Success screen */}
            {disputeSuccess ? (
              <div className="flex-1 flex flex-col items-center justify-center px-5 py-10 gap-4">
                <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-emerald-500" />
                </div>
                <div className="text-center">
                  <p className="font-bold text-stone-900 text-lg">Dispute Filed</p>
                  <p className="text-stone-500 text-sm mt-1">Our team has been notified and will review your case shortly.</p>
                </div>
              </div>
            ) : null}

            {/* Scrollable body */}
            {!disputeSuccess && <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">

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
                  rows={3}
                  placeholder="What happened? Be as specific as possible..."
                  className="w-full px-4 py-3 rounded-xl border border-stone-200 text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 bg-white placeholder:text-stone-400 resize-none transition disabled:opacity-50"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-stone-500 mb-1.5 block">
                  Evidence <span className="text-red-400">*</span>
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

              <div>
                <label className="text-xs font-semibold text-stone-500 mb-1.5 block">
                  Photos <span className="text-red-400">* </span><span className="text-stone-400 font-normal">(max 2)</span>
                </label>
                <div className="flex gap-3">
                  {[0, 1].map(idx => (
                    <div key={idx} className="flex-1">
                      {disputePreviews[idx] ? (
                        <div className="relative aspect-square rounded-xl overflow-hidden border border-stone-200">
                          <img src={disputePreviews[idx]!} alt={`Evidence ${idx + 1}`} className="w-full h-full object-cover" />
                          <button
                            onClick={() => removeDisputeImage(idx)}
                            disabled={disputing}
                            className="absolute top-1 right-1 w-6 h-6 bg-black/60 text-white rounded-full flex items-center justify-center"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => [disputeImgRef1, disputeImgRef2][idx].current?.click()}
                          disabled={disputing || (idx === 1 && !disputeImages[0])}
                          className="w-full aspect-square rounded-xl border-2 border-dashed border-stone-200 flex flex-col items-center justify-center gap-1.5 text-stone-400 hover:border-red-300 hover:text-red-400 transition disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {idx === 0 ? <Camera className="w-6 h-6" /> : <ImagePlus className="w-6 h-6" />}
                          <span className="text-xs font-medium">{idx === 0 ? "Photo 1" : "Photo 2"}</span>
                        </button>
                      )}
                      <input
                        ref={[disputeImgRef1, disputeImgRef2][idx]}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) pickDisputeImage(idx, f); e.target.value = ""; }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>}

            {/* Pinned action buttons — always above nav */}
            {!disputeSuccess && <div className="px-5 pt-3 pb-6 border-t border-stone-100 flex gap-3 shrink-0">
              <button
                onClick={() => { resetDisputeModal(); setShowDisputeModal(false); }}
                disabled={disputing}
                className="flex-1 py-3 bg-stone-100 text-stone-700 rounded-full font-semibold text-sm disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDisputeSubmit}
                disabled={disputing || !disputeComplaint.trim() || !disputeEvidence.trim() || !disputeImages[0]}
                className="flex-1 py-3 bg-red-500 text-white rounded-full font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {disputing
                  ? <div className="animate-spin"><Clock className="w-5 h-5" /></div>
                  : <><AlertCircle className="w-4 h-4" /> Submit Dispute</>}
              </button>
            </div>}
          </div>
        </div>
      )}

      {/* CONFIRM MODAL */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => !confirming && (setShowModal(false), setAcknowledged(false))}
        >
          <div
            className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border border-stone-100 animate-fadeUp"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-stone-900 mb-2">Confirm Service Received?</h3>

            <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 flex gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 leading-relaxed">
                Payment is released to the vendor <span className="font-bold">immediately</span> once you confirm. You will not be able to file a dispute yourself after this point. Only confirm if you are satisfied.
              </p>
            </div>

            <div className="bg-teal-50 rounded-xl p-4 mb-4 text-center">
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

            <label className="flex items-start gap-3 mb-5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={e => setAcknowledged(e.target.checked)}
                disabled={confirming}
                className="mt-0.5 w-4 h-4 accent-teal-600 flex-shrink-0 cursor-pointer"
              />
              <span className="text-xs text-stone-700 leading-relaxed">
                I have inspected the delivery proof and I understand that confirming releases payment to the vendor immediately and cannot be undone.
              </span>
            </label>

            <div className="flex gap-3">
              <button onClick={() => { setShowModal(false); setAcknowledged(false); }} disabled={confirming}
                className="flex-1 py-3 bg-stone-100 text-stone-700 rounded-full font-semibold disabled:opacity-50">
                Cancel
              </button>
              <button onClick={handleConfirm} disabled={confirming || !acknowledged}
                className="flex-1 py-3 text-white rounded-full font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: TEAL }}>
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
