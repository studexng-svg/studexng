// src/app/account/bookings/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar, Clock, CheckCircle2, XCircle,
  CreditCard, AlertCircle, Loader, RefreshCw,
  ChevronRight, Hourglass, Ban,
} from "lucide-react";
import TopNav from "@/components/layout/TopNav";
import { useAuth } from "@/lib/authStore";
import { api } from "@/lib/api";
import { GRAD, SERIF, toArray, calcServiceFee } from "@/lib/tokens";
import { useQuery, useQueryClient } from "@tanstack/react-query";



interface Booking {
  id: number;
  listing: number;
  listing_title: string;
  listing_price: string;
  vendor_name: string;
  buyer_username: string;
  scheduled_date: string;
  scheduled_time: string;
  note: string;
  status: "pending" | "confirmed" | "cancelled" | "paid";
  created_at: string;
}

interface LoyaltyStatus {
  credit_balance: string;
}

const STATUS = {
  pending: {
    label: "Awaiting Vendor",
    icon: Hourglass,
    color: "text-amber-600",
    bg: "bg-amber-50 border-amber-200",
    badge: "bg-amber-100 text-amber-700",
    message: "Your booking has been sent. Waiting for the vendor to accept or decline.",
  },
  paid: {
    label: "Paid ✓",
    bg: "bg-blue-50 border-blue-200",
    badge: "bg-blue-100 text-blue-700",
    color: "text-blue-600",
    icon: CheckCircle2,
    message: "Payment received. Your appointment is confirmed.",
  },
  confirmed: {
    label: "Accepted — Pay Now",
    icon: CheckCircle2,
    color: "text-teal-600",
    bg: "bg-teal-50 border-teal-200",
    badge: "bg-teal-100 text-teal-700",
    message: "The vendor has accepted your booking! Complete your payment to confirm the appointment.",
  },
  cancelled: {
    label: "Declined / Cancelled",
    icon: XCircle,
    color: "text-red-500",
    bg: "bg-red-50 border-red-200",
    badge: "bg-red-100 text-red-600",
    message: "This booking was cancelled. You can rebook or try a different vendor.",
  },
};

export default function BuyerBookingsPage() {
  const router = useRouter();
  const { user, isLoggedIn, isHydrated } = useAuth();
  const queryClient = useQueryClient();

  const [payingId, setPayingId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "confirmed" | "cancelled" | "paid">("all");
  const [useCredits, setUseCredits] = useState(false);
  const [paystackReady, setPaystackReady] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Load Paystack script on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ((window as any).PaystackPop) { setPaystackReady(true); return; }
    const existing = document.getElementById("paystack-script");
    if (existing) { existing.addEventListener("load", () => setPaystackReady(true)); return; }
    const script = document.createElement("script");
    script.id = "paystack-script";
    script.src = "https://js.paystack.co/v1/inline.js";
    script.async = true;
    script.onload = () => setPaystackReady(true);
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (isHydrated && !isLoggedIn) router.push("/auth");
  }, [isHydrated, isLoggedIn, router]);

  // Handle return from Paystack redirect flow (mobile fallback)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("reference") || params.get("trxref");
    if (!ref) return;

    let pending: { listing_id: number; applied_credits: number; reference: string } | null = null;
    try { pending = JSON.parse(sessionStorage.getItem("pendingBookingPayment") || "null"); } catch { /* ignore */ }
    if (!pending || pending.reference !== ref) {
      window.history.replaceState({}, "", "/account/bookings");
      return;
    }

    try { sessionStorage.removeItem("pendingBookingPayment"); } catch { /* ignore */ }
    window.history.replaceState({}, "", "/account/bookings");

    setVerifying(true);
    api.payments.verify({
      reference: ref,
      transaction_id: ref,
      listing_id: pending.listing_id,
      order_type: "service",
      use_credits: pending.applied_credits > 0,
      credits_applied: pending.applied_credits,
    }).then(async res => {
      const data = await res.json();
      if (res.ok && data.order_id) {
        queryClient.invalidateQueries({ queryKey: ["bookings"] });
        router.push(`/order-confirmation/${data.order_id}`);
      } else {
        setVerifying(false);
        showToast(data.error || `Payment received. Save reference: ${ref}`, true);
        queryClient.invalidateQueries({ queryKey: ["bookings"] });
      }
    }).catch(() => {
      setVerifying(false);
      showToast(`Payment received. Save this reference: ${ref}`, true);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: bookingsData, isPending: isBookingsPending, isError } = useQuery<Booking[]>({
    queryKey: ["bookings"],
    queryFn: async () => {
      const res = await api.orders.bookings();
      if (!res.ok) throw new Error("Failed to load bookings");
      const data = await res.json();
      const all: Booking[] = toArray(data);
      return all.filter(b => b.buyer_username === user?.username);
    },
    enabled: isHydrated && isLoggedIn && !!user,
    staleTime: 30_000,
  });

  const { data: loyaltyData } = useQuery<LoyaltyStatus>({
    queryKey: ["loyalty-status"],
    queryFn: async () => {
      const r = await api.loyalty.status();
      if (!r.ok) throw new Error("loyalty fetch failed");
      return r.json();
    },
    enabled: isHydrated && isLoggedIn,
    staleTime: 30_000,
  });

  const bookings = bookingsData ?? [];
  const loyaltyBalance = loyaltyData ? (parseFloat(loyaltyData.credit_balance) || 0) : 0;

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const cancelBooking = async (id: number) => {
    if (!confirm("Are you sure you want to cancel this booking?")) return;
    try {
      const res = await api.orders.bookingAction(id, "cancel");
      if (res.ok) {
        showToast("Booking cancelled.");
        queryClient.invalidateQueries({ queryKey: ["bookings"] });
      } else {
        showToast("Could not cancel. Try again.", false);
      }
    } catch { showToast("Error cancelling booking.", false); }
  };

  const activeBooking = bookings.find(b => b.id === payingId);
  const listingPrice = activeBooking ? parseFloat(activeBooking.listing_price) : 0;
  const fullCheckoutAmount = listingPrice + calcServiceFee(listingPrice);
  const creditsToApply = useCredits ? Math.min(loyaltyBalance, fullCheckoutAmount) : 0;
  const isFullyCoveredByCredits = useCredits && creditsToApply >= fullCheckoutAmount && fullCheckoutAmount > 0;
  const amountAfterCredits = isFullyCoveredByCredits ? 0 : Math.max(listingPrice - creditsToApply, 0);
  const serviceFee = isFullyCoveredByCredits ? 0 : calcServiceFee(amountAfterCredits);
  const totalWithFee = isFullyCoveredByCredits ? 0 : amountAfterCredits + serviceFee;

  const proceedToPaystack = async () => {
    if (!activeBooking) return;
    if (!isFullyCoveredByCredits && !(window as any).PaystackPop) {
      showToast("Payment system not ready. Please refresh and try again.", false);
      return;
    }

    const paystackKey = (process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || "").trim();
    setIsProcessing(true);

    // Full credits coverage — skip Paystack entirely
    if (isFullyCoveredByCredits) {
      try {
        const res = await api.payments.payWithCredits({ listing_id: activeBooking.listing });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Payment failed");
        setPayingId(null);
        showToast("Order placed with loyalty credits!");
        queryClient.invalidateQueries({ queryKey: ["bookings"] });
        queryClient.invalidateQueries({ queryKey: ["loyalty-status"] });
        router.push(`/order-confirmation/${data.order_id}`);
      } catch (err: any) {
        showToast(err.message || "Payment failed. Try again.", false);
        setIsProcessing(false);
      }
      return;
    }

    const bookingToCharge = activeBooking;

    try {
      const initRes = await api.payments.initialize({
        listing_id: bookingToCharge.listing,
        ...(useCredits && creditsToApply > 0 ? { use_credits: true } : {}),
      });
      const initData = await initRes.json();
      if (!initRes.ok) throw new Error(initData.error || "Failed to initialize payment");

      const { access_code, reference, amount_kobo, credits_applied: serverCredits } = initData;
      if (!access_code) throw new Error("Payment initialization failed. Please try again.");

      const appliedCredits = serverCredits ?? 0;

      const handler = (window as any).PaystackPop.setup({
        key: paystackKey,
        access_code,
        email: user?.email || "",
        amount: amount_kobo ?? Math.round(totalWithFee * 100),
        currency: "NGN",
        ref: reference,
        callback: function(response: any) {
          if (response.status === "success") {
            setPayingId(null);
            setIsProcessing(false);
            setVerifying(true);
            api.payments.verify({
              reference: response.reference,
              transaction_id: response.reference,
              listing_id: bookingToCharge.listing,
              order_type: "service",
              use_credits: appliedCredits > 0,
              credits_applied: appliedCredits,
            }).then(async (res) => {
              const data = await res.json();
              if (res.ok && data.order_id) {
                queryClient.invalidateQueries({ queryKey: ["bookings"] });
                router.push(`/order-confirmation/${data.order_id}`);
              } else {
                setVerifying(false);
                showToast(data.error || `Payment received. Save reference: ${response.reference}`, true);
                queryClient.invalidateQueries({ queryKey: ["bookings"] });
              }
            }).catch(() => {
              setVerifying(false);
              showToast(`Payment received. Save reference: ${response.reference}`, true);
              queryClient.invalidateQueries({ queryKey: ["bookings"] });
            });
          } else {
            setIsProcessing(false);
          }
        },
        onClose: function() {
          setIsProcessing(false);
        },
      });
      handler.openIframe();
    } catch (err: any) {
      showToast(err.message || "Could not start payment. Try again.", false);
      setIsProcessing(false);
    }
  };

  const handlePay = (bookingId: number) => { setUseCredits(false); setPayingId(bookingId); };

  const filtered = filter === "all" ? bookings : bookings.filter(b => b.status === filter);
  const counts = {
    all: bookings.length,
    pending: bookings.filter(b => b.status === "pending").length,
    confirmed: bookings.filter(b => b.status === "confirmed").length,
    cancelled: bookings.filter(b => b.status === "cancelled").length,
    paid: bookings.filter(b => b.status === "paid").length,
  };

  if (!isHydrated || isBookingsPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F5F5]">
        <Loader className="w-10 h-10 text-teal-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* TOAST */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className={`fixed top-4 left-1/2 -translate-x-1/2 z-[9999] px-6 py-3 rounded-full font-semibold text-sm shadow-xl whitespace-nowrap ${toast.ok ? "bg-teal-500 text-white" : "bg-red-500 text-white"}`}>
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* VERIFYING OVERLAY */}
      <AnimatePresence>
        {verifying && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-[9998] flex items-center justify-center">
            <div className="bg-white rounded-2xl p-8 shadow-2xl text-center max-w-xs mx-4 border border-stone-100">
              <Loader className="w-12 h-12 text-teal-600 animate-spin mx-auto mb-4" />
              <p className="font-semibold text-stone-900 text-lg">Confirming Payment</p>
              <p className="text-sm text-stone-500 mt-2">Please wait while we verify your payment...</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PAYMENT MODAL */}
      <AnimatePresence>
        {payingId && activeBooking && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }} transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border border-stone-100 overflow-y-auto"
              style={{ maxHeight: "calc(100dvh - 3rem)" }}>
              <h2 className="text-xl font-bold text-stone-900 mb-1">Confirm Payment</h2>
              <p className="text-sm text-stone-500 mb-5">You're about to pay for this confirmed booking.</p>

              <div className="bg-stone-50 rounded-2xl p-4 mb-5 space-y-2 border border-stone-100">
                <div className="flex justify-between text-sm gap-4">
                  <span className="text-stone-500 flex-shrink-0">Service</span>
                  <span className="font-semibold text-stone-900 text-right">{activeBooking.listing_title}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-stone-500">Vendor</span>
                  <span className="font-semibold text-stone-900">{activeBooking.vendor_name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-stone-500">Date</span>
                  <span className="font-semibold text-stone-900">{activeBooking.scheduled_date}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-stone-500">Time</span>
                  <span className="font-semibold text-stone-900">{activeBooking.scheduled_time}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-stone-500">Service Fee</span>
                  <span className="font-medium text-teal-600">₦{serviceFee.toLocaleString()}</span>
                </div>
                <div className="border-t border-stone-200 pt-2 flex justify-between">
                  <span className="font-semibold text-stone-900">Total</span>
                  <span className="font-bold text-teal-600 text-lg">₦{totalWithFee.toLocaleString()}</span>
                </div>
              </div>

              {loyaltyBalance > 0 && (
                <button onClick={() => setUseCredits(v => !v)}
                  className={`w-full flex items-center justify-between rounded-2xl p-4 mb-4 border-2 transition ${useCredits ? "bg-amber-50 border-amber-400" : "bg-stone-50 border-stone-200"}`}>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🎁</span>
                    <div className="text-left">
                      <p className="font-semibold text-sm text-stone-900">Use Loyalty Credits</p>
                      <p className="text-xs text-stone-500">You have ₦{loyaltyBalance.toLocaleString()} available</p>
                    </div>
                  </div>
                  <div className={`w-12 h-6 rounded-full transition-colors flex items-center px-1 ${useCredits ? "bg-amber-400" : "bg-stone-300"}`}>
                    <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${useCredits ? "translate-x-6" : "translate-x-0"}`} />
                  </div>
                </button>
              )}

              {useCredits && creditsToApply > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-stone-500">Original</span>
                    <span className="text-stone-500 line-through">₦{listingPrice.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-amber-600 font-semibold">Credits applied</span>
                    <span className="text-amber-600 font-semibold">- ₦{creditsToApply.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between font-semibold border-t border-amber-200 pt-1">
                    <span className="text-stone-900">You pay</span>
                    <span className="text-teal-600 text-lg">₦{amountAfterCredits.toLocaleString()}</span>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl p-3 mb-5">
                <AlertCircle className="w-4 h-4 text-blue-500 flex-shrink-0" />
                <p className="text-xs text-blue-700">
                  Payment is processed securely by Paystack. The vendor receives their share automatically.
                </p>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setPayingId(null)}
                  className="flex-1 py-3 bg-stone-100 rounded-full font-semibold text-stone-600 text-sm">
                  Cancel
                </button>
                <button onClick={proceedToPaystack} disabled={isProcessing}
                  className="flex-1 py-3 text-white rounded-full font-semibold text-sm flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform disabled:opacity-70"
                  style={{ background: GRAD }}>
                  {isProcessing
                    ? <><Loader className="w-4 h-4 animate-spin" /> Processing...</>
                    : <><CreditCard className="w-4 h-4" />{isFullyCoveredByCredits ? "Pay with Credits" : `Pay ₦${totalWithFee.toLocaleString()}`}</>
                  }
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <TopNav showBack />

      <div className="max-w-2xl mx-auto px-4 pt-5 pb-44 space-y-4">
        {/* FILTER TABS */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none [&::-webkit-scrollbar]:hidden">
          {(["all", "pending", "confirmed", "cancelled"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold capitalize transition ${
                filter === f
                  ? "text-white shadow-md"
                  : "bg-white text-stone-500 border border-stone-200"
              }`}
              style={filter === f ? { background: GRAD } : {}}>
              {f}{counts[f] > 0 && <span className={`ml-1 text-xs ${filter === f ? "opacity-80" : "text-teal-500"}`}>({counts[f]})</span>}
            </button>
          ))}
        </div>

        {isError && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700 font-medium">Could not load bookings. Pull to refresh.</p>
          </div>
        )}

        {filtered.length === 0 && !isError && (
          <div className="text-center py-20">
            <Calendar className="w-14 h-14 text-stone-300 mx-auto mb-4" />
            <p className="font-semibold text-stone-500 text-lg">No {filter === "all" ? "" : filter} bookings</p>
            <p className="text-sm text-stone-400 mt-1">
              {filter === "all" ? "Book a service from any vendor listing to get started." : `You have no ${filter} bookings right now.`}
            </p>
          </div>
        )}

        <div className="space-y-4">
          {filtered.map(booking => {
            const cfg = STATUS[booking.status as keyof typeof STATUS];
            const Icon = cfg.icon;
            const isBookingConfirmed = booking.status === "confirmed";
            const isBookingPending = booking.status === "pending";

            return (
              <motion.div key={booking.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className={`rounded-2xl border p-4 ${cfg.bg}`}>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-stone-900 text-base leading-tight">{booking.listing_title}</p>
                    <p className="text-sm text-stone-500 mt-0.5">by <span className="font-semibold">{booking.vendor_name}</span></p>
                  </div>
                  <span className={`flex-shrink-0 flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${cfg.badge}`}>
                    <Icon className="w-3.5 h-3.5" />{cfg.label}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="bg-white/60 rounded-xl p-2.5 text-center">
                    <Calendar className="w-4 h-4 mx-auto mb-1 text-stone-400" />
                    <p className="text-xs font-semibold text-stone-700">{booking.scheduled_date}</p>
                  </div>
                  <div className="bg-white/60 rounded-xl p-2.5 text-center">
                    <Clock className="w-4 h-4 mx-auto mb-1 text-stone-400" />
                    <p className="text-xs font-semibold text-stone-700">{booking.scheduled_time}</p>
                  </div>
                  <div className="bg-white/60 rounded-xl p-2.5 text-center">
                    <p className="text-xs text-stone-400 mb-1">Price</p>
                    <p className="text-xs font-semibold text-teal-600">₦{Number(booking.listing_price).toLocaleString()}</p>
                  </div>
                </div>

                <p className={`text-xs font-medium mb-3 ${cfg.color}`}>{cfg.message}</p>

                {booking.note && (
                  <div className="bg-white/50 rounded-xl p-2.5 mb-3">
                    <p className="text-xs text-stone-500 italic">Note: {booking.note}</p>
                  </div>
                )}

                <div className="flex gap-2">
                  {isBookingConfirmed && (
                    <button onClick={() => handlePay(booking.id)}
                      className="flex-1 py-3 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 shadow-md active:scale-95 transition-transform"
                      style={{ background: GRAD }}>
                      <CreditCard className="w-4 h-4" /> Pay ₦{(Number(booking.listing_price) + calcServiceFee(Number(booking.listing_price))).toLocaleString()}
                    </button>
                  )}
                  {isBookingPending && (
                    <button onClick={() => cancelBooking(booking.id)}
                      className="flex-shrink-0 py-3 px-4 bg-white border border-red-200 text-red-500 rounded-xl font-semibold text-sm flex items-center gap-1.5">
                      <Ban className="w-4 h-4" /> Cancel
                    </button>
                  )}
                  {booking.status === "cancelled" && (
                    <button onClick={() => router.push("/home")}
                      className="flex-1 py-3 bg-white border border-stone-200 text-stone-600 rounded-xl font-semibold text-sm flex items-center justify-center gap-2">
                      Find another vendor <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
