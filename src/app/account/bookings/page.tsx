// src/app/account/bookings/page.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Calendar, Clock, CheckCircle2, XCircle,
  CreditCard, AlertCircle, Loader, RefreshCw,
  ChevronRight, Hourglass, Ban,
} from "lucide-react";
import { useAuth, fetchWithAuth } from "@/lib/authStore";
import { GRAD, SERIF, toArray } from "@/lib/tokens";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const SERVICE_FEE = 200;

interface Booking {
  id: number;
  listing: number;
  listing_title: string;
  listing_price: string;
  vendor_name: string;
  vendor_subaccount_code: string | null;
  buyer_username: string;
  scheduled_date: string;
  scheduled_time: string;
  note: string;
  status: "pending" | "confirmed" | "cancelled" | "paid";
  created_at: string;
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
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payingId, setPayingId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "confirmed" | "cancelled" | "paid">("all");
  const [useCredits, setUseCredits] = useState(false);
  const [loyaltyBalance, setLoyaltyBalance] = useState(0);
  const [paystackReady, setPaystackReady] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const referenceRef = useRef(`STUDEX-BKG-${Date.now()}`);
  const activeBookingRef = useRef<Booking | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

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
  }, [isHydrated, isLoggedIn]);

  useEffect(() => {
    if (!isHydrated || !isLoggedIn) return;
    loadBookings();
  }, [isHydrated, isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) return;
    fetchWithAuth(`${API_URL}/api/loyalty/status/`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setLoyaltyBalance(parseFloat(d.credit_balance) || 0); })
      .catch(() => {});
  }, [isLoggedIn]);

  useEffect(() => {
    if (payingId) {
      referenceRef.current = `STUDEX-BKG-${Date.now()}-${payingId}`;
      activeBookingRef.current = bookings.find(b => b.id === payingId) || null;
    }
  }, [payingId, bookings]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => { if (pollIntervalRef.current) clearInterval(pollIntervalRef.current); };
  }, []);

  const loadBookings = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchWithAuth(`${API_URL}/api/orders/bookings/`);
      if (!res.ok) throw new Error("Failed to load bookings");
      const data = await res.json();
      const all: Booking[] = toArray(data);
      setBookings(all.filter(b => b.buyer_username === user?.username));
    } catch {
      setError("Could not load bookings. Pull to refresh.");
    } finally {
      setLoading(false);
    }
  };

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const cancelBooking = async (id: number) => {
    if (!confirm("Are you sure you want to cancel this booking?")) return;
    try {
      const res = await fetchWithAuth(`${API_URL}/api/orders/bookings/${id}/cancel/`, { method: "POST" });
      if (res.ok) { showToast("Booking cancelled."); loadBookings(); }
      else showToast("Could not cancel. Try again.", false);
    } catch { showToast("Error cancelling booking.", false); }
  };

  /**
   * Poll the backend every 2 seconds for up to 30 seconds.
   * The webhook creates the order server-side — we just wait for it.
   */
  const startPolling = (txRef: string) => {
    setVerifying(true);
    showToast("Verifying payment...", true);
    let attempts = 0;
    const maxAttempts = 15; // 15 × 2s = 30s

    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

    pollIntervalRef.current = setInterval(async () => {
      attempts++;
      try {
        const res = await fetchWithAuth(`${API_URL}/api/payments/check-status/?tx_ref=${txRef}`);
        if (res.ok) {
          const data = await res.json();
          if (data.status === "paid" && data.order_id) {
            clearInterval(pollIntervalRef.current!);
            setVerifying(false);
            showToast("🎉 Payment confirmed! Booking is now paid.");
            await loadBookings();
            setTimeout(() => router.push(`/account/orders/${data.order_id}`), 1200);
            return;
          }
        }
      } catch { /* continue polling */ }

      if (attempts >= maxAttempts) {
        clearInterval(pollIntervalRef.current!);
        setVerifying(false);
        await fallbackVerify(txRef);
      }
    }, 2000);
  };

  /**
   * Fallback: call verify endpoint directly if polling times out.
   */
  const fallbackVerify = async (txRef: string) => {
    const booking = activeBookingRef.current;
    if (!booking) {
      showToast("Payment received. Refresh to see updated status.", true);
      await loadBookings();
      return;
    }

    try {
      const res = await fetchWithAuth(`${API_URL}/api/payments/verify/`, {
        method: "POST",
        body: JSON.stringify({
          reference: txRef,
          listing_id: booking.listing,
          order_type: "service",
          use_credits: useCredits,
        }),
      });
      const data = await res.json();
      if (res.ok && data.order_id) {
        showToast("🎉 Payment confirmed!");
        await loadBookings();
        setTimeout(() => router.push(`/account/orders/${data.order_id}`), 1200);
      } else {
        showToast("Payment received. Check your orders page.", true);
        await loadBookings();
      }
    } catch {
      showToast("Payment received. Check your orders page.", true);
      await loadBookings();
    }
  };

  const activeBooking = bookings.find(b => b.id === payingId);
  const listingPrice = activeBooking ? parseFloat(activeBooking.listing_price) : 0;
  const creditsToApply = useCredits ? Math.min(loyaltyBalance, listingPrice) : 0;
  const amountAfterCredits = Math.max(listingPrice - creditsToApply, 0);
  const totalWithFee = amountAfterCredits + SERVICE_FEE;

  const proceedToPaystack = () => {
    if (!activeBooking) return;

    const PaystackPop = (window as any).PaystackPop;
    if (!PaystackPop) {
      const script = document.createElement("script");
      script.src = "https://js.paystack.co/v1/inline.js";
      script.onload = () => { setPaystackReady(true); showToast("Ready! Tap Pay again.", true); };
      document.head.appendChild(script);
      showToast("Loading payment... tap Pay again in 3 seconds.", false);
      return;
    }

    const subaccountCode = (activeBookingRef.current || activeBooking).vendor_subaccount_code?.trim();
    const txRef = referenceRef.current;

    setPayingId(null); // Close modal before opening Paystack

    const handler = PaystackPop.setup({
      key: (process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || "").trim(),
      email: (user?.email || "").trim(),
      // Paystack amounts are in kobo — multiply naira × 100
      amount: totalWithFee * 100,
      currency: "NGN",
      ref: txRef,
      // Vendor subaccount split: StudEx keeps ₦200 flat (20000 kobo)
      ...(subaccountCode && subaccountCode.startsWith("ACCT_") ? {
        subaccount: subaccountCode,
        transaction_charge: 20000,
        bearer: "account",
      } : {}),
      metadata: {
        custom_fields: [],
        listing_id: (activeBookingRef.current || activeBooking).listing,
        type: "booking_payment",
      },
      callback: (response: any) => {
        if (response.status === "success") {
          startPolling(response.reference || txRef);
        }
      },
      onClose: () => {
        startPolling(txRef);
      },
    });
    handler.openIframe();
  };

  const handlePay = (bookingId: number) => setPayingId(bookingId);

  const filtered = filter === "all" ? bookings : bookings.filter(b => b.status === filter);
  const counts = {
    all: bookings.length,
    pending: bookings.filter(b => b.status === "pending").length,
    confirmed: bookings.filter(b => b.status === "confirmed").length,
    cancelled: bookings.filter(b => b.status === "cancelled").length,
    paid: bookings.filter(b => b.status === "paid").length,
  };

  if (!isHydrated || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAF9]">
        <Loader className="w-10 h-10 text-teal-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF9]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
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
                  <span className="font-medium text-teal-600">₦{SERVICE_FEE.toLocaleString()}</span>
                </div>
                <div className="border-t border-stone-200 pt-2 flex justify-between">
                  <span className="font-semibold text-stone-900">Total</span>
                  <span className="font-bold text-teal-600 text-lg">₦{(Number(activeBooking.listing_price) + SERVICE_FEE).toLocaleString()}</span>
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
                <button onClick={proceedToPaystack}
                  className="flex-1 py-3 text-white rounded-full font-semibold text-sm flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform"
                  style={{ background: GRAD }}>
                  <CreditCard className="w-4 h-4" />
                  {paystackReady ? `Pay ₦${totalWithFee.toLocaleString()}` : "Loading..."}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* HEADER */}
      <div className="sticky top-0 bg-white/80 backdrop-blur-md z-40 border-b border-stone-100 shadow-sm">
        <div className="flex items-center justify-between px-4 py-3 max-w-2xl mx-auto">
          <button
            onClick={() => router.back()}
            className="p-2.5 bg-white border border-stone-200 rounded-full shadow-sm active:scale-95 transition-all"
          >
            <ArrowLeft className="w-5 h-5 text-stone-600" />
          </button>
          <h1 className="text-base font-bold text-stone-900" style={SERIF}>
            My Bookings
          </h1>
          <button
            onClick={loadBookings}
            className="p-2.5 bg-white border border-stone-200 rounded-full shadow-sm active:scale-95 transition-all"
          >
            <RefreshCw className="w-4 h-4 text-stone-500" />
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-5 pb-44 space-y-4">
        {/* FILTER TABS */}
        <div className="flex gap-2 overflow-x-auto pb-1">
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

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700 font-medium">{error}</p>
          </div>
        )}

        {filtered.length === 0 && !error && (
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
            const isConfirmed = booking.status === "confirmed";
            const isPending = booking.status === "pending";

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
                  {isConfirmed && (
                    <button onClick={() => handlePay(booking.id)}
                      className="flex-1 py-3 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 shadow-md active:scale-95 transition-transform"
                      style={{ background: GRAD }}>
                      <CreditCard className="w-4 h-4" /> Pay ₦{(Number(booking.listing_price) + SERVICE_FEE).toLocaleString()}
                    </button>
                  )}
                  {isPending && (
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
