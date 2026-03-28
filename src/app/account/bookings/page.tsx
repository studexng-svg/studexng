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
import { useAuth, fetchWithAuth, getToken } from "@/lib/authStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

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
    bg: "bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-700",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    message: "Your booking has been sent. Waiting for the vendor to accept or decline.",
  },
  paid: {
    label: "Paid ✓",
    bg: "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-700",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    color: "text-blue-600 dark:text-blue-400",
    icon: CheckCircle2,
    message: "Payment received. Your appointment is confirmed.",
  },
  confirmed: {
    label: "Accepted — Pay Now",
    icon: CheckCircle2,
    color: "text-teal-600",
    bg: "bg-teal-50 border-teal-200 dark:bg-teal-900/20 dark:border-teal-700",
    badge: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
    message: "The vendor has accepted your booking! Complete your payment to confirm the appointment.",
  },
  cancelled: {
    label: "Declined / Cancelled",
    icon: XCircle,
    color: "text-red-500",
    bg: "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-700",
    badge: "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400",
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
  const [flwReady, setFlwReady] = useState(false);
  const referenceRef = useRef(`STUDEX-BKG-${Date.now()}`);
  const activeBookingRef = useRef<Booking | null>(null);

  // Load Flutterwave script on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ((window as any).FlutterwaveCheckout) { setFlwReady(true); return; }
    const existing = document.getElementById("flw-script");
    if (existing) {
      existing.addEventListener("load", () => setFlwReady(true));
      return;
    }
    const script = document.createElement("script");
    script.id = "flw-script";
    script.src = "https://checkout.flutterwave.com/v3.js";
    script.async = true;
    script.onload = () => setFlwReady(true);
    script.onerror = () => console.error("Failed to load Flutterwave");
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
      // Store in ref so callback closure always has fresh value
      activeBookingRef.current = bookings.find(b => b.id === payingId) || null;
    }
  }, [payingId, bookings]);

  const loadBookings = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchWithAuth(`${API_URL}/api/orders/bookings/`);
      if (!res.ok) throw new Error("Failed to load bookings");
      const data = await res.json();
      const all: Booking[] = Array.isArray(data) ? data : (data.results || []);
      setBookings(all.filter(b => b.buyer_username === user?.username));
    } catch {
      setError("Could not load bookings. Pull to refresh.");
    } finally {
      setLoading(false);
    }
  };

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const cancelBooking = async (id: number) => {
    if (!confirm("Are you sure you want to cancel this booking?")) return;
    try {
      const res = await fetchWithAuth(`${API_URL}/api/orders/bookings/${id}/cancel/`, { method: "POST" });
      if (res.ok) { showToast("Booking cancelled."); loadBookings(); }
      else showToast("Could not cancel. Try again.", false);
    } catch {
      showToast("Error cancelling booking.", false);
    }
  };

  const activeBooking = bookings.find(b => b.id === payingId);
  const listingPrice = activeBooking ? parseFloat(activeBooking.listing_price) : 0;
  const creditsToApply = useCredits ? Math.min(loyaltyBalance, listingPrice) : 0;
  const amountAfterCredits = Math.max(listingPrice - creditsToApply, 0);

  const proceedToFlutterwave = () => {
    if (!activeBooking) return;

    const FlutterwaveCheckout = (window as any).FlutterwaveCheckout;
    if (typeof FlutterwaveCheckout !== "function") {
      const script = document.createElement("script");
      script.src = "https://checkout.flutterwave.com/v3.js";
      script.onload = () => {
        setFlwReady(true);
        showToast("Payment ready! Tap Pay again.", true);
      };
      document.head.appendChild(script);
      showToast("Loading payment... tap Pay again in 3 seconds.", false);
      return;
    }

    const bookingForPayment = activeBookingRef.current || activeBooking;
    const subaccountId = bookingForPayment?.vendor_subaccount_code?.trim();

    // Strip key of any accidental whitespace/newlines from env
    const flwKey = (process.env.NEXT_PUBLIC_FLW_PUBLIC_KEY || "").trim();

    const flwConfig: Record<string, any> = {
      public_key: flwKey,
      tx_ref: referenceRef.current,
      amount: amountAfterCredits,
      currency: "NGN",
      payment_options: "card,banktransfer,ussd",
      customer: {
        email: (user?.email || "").trim(),
        name: (user?.username || "").trim(),
        phone_number: "",
      },
      customizations: {
        title: "StudEx",
        description: "Service Booking",
      },
    };

    // Only add subaccounts if we have a valid RS_ id
    if (subaccountId && subaccountId.startsWith("RS_")) {
      flwConfig.subaccounts = [{ id: subaccountId }];
    }

    FlutterwaveCheckout({
      ...flwConfig,
      callback: async (response: any) => {
        // Close the modal first so user sees the app
        setPayingId(null);
        showToast("Verifying payment...", true);

        try {
          // Read token directly from Zustand persisted storage
          let token: string | null = null;
          try {
            const stored = localStorage.getItem("auth-storage");
            token = stored ? JSON.parse(stored)?.state?.accessToken ?? null : null;
          } catch {}
          if (!token) token = getToken();

          if (!token) {
            showToast("Session expired. Payment received — please refresh.", false);
            router.push("/account/bookings");
            return;
          }

          const res = await fetch(`${API_URL}/api/payments/verify/`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              reference: response.tx_ref,
              transaction_id: String(response.transaction_id),
              listing_id: (activeBookingRef.current || activeBooking)?.listing,
              order_type: "service",
              use_credits: useCredits,
            }),
          });

          const data = await res.json();

          if (res.ok) {
            showToast("🎉 Booking confirmed! Payment successful.");
            // Reload bookings so status shows "paid"
            await loadBookings();
            // Redirect to orders page
            setTimeout(() => {
              router.push("/account/orders");
            }, 1500);
          } else {
            showToast(data.error || "Payment received but verification failed. Contact support.", false);
            await loadBookings();
          }
        } catch (err) {
          console.error("Verify callback error:", err);
          showToast("Payment received. Refreshing your bookings...", false);
          await loadBookings();
          setTimeout(() => router.push("/account/bookings"), 2000);
        }
      },
      onclose: () => {
        setPayingId(null);
      },
    });
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
      <div className="min-h-screen flex items-center justify-center bg-[#FFF8F0] dark:bg-gray-950">
        <Loader className="w-10 h-10 text-purple-600 animate-spin" />
      </div>
    );
  }

  return (
    <>
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className={`fixed top-4 left-1/2 -translate-x-1/2 z-[9999] px-6 py-3 rounded-full font-bold text-sm shadow-xl whitespace-nowrap ${
              toast.ok ? "bg-teal-500 text-white" : "bg-red-500 text-white"
            }`}
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {payingId && activeBooking && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-white dark:bg-gray-900 rounded-3xl p-6 w-full max-w-md shadow-2xl overflow-y-auto"
              style={{ maxHeight: "calc(100dvh - 3rem)" }}
            >
              <h2 className="text-xl font-black text-gray-900 dark:text-white mb-1">Confirm Payment</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">You're about to pay for this confirmed booking.</p>

              <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-4 mb-5 space-y-2">
                <div className="flex justify-between text-sm gap-4">
                  <span className="text-gray-500 flex-shrink-0">Service</span>
                  <span className="font-bold text-gray-900 dark:text-white text-right">{activeBooking.listing_title}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Vendor</span>
                  <span className="font-bold text-gray-900 dark:text-white">{activeBooking.vendor_name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Date</span>
                  <span className="font-bold text-gray-900 dark:text-white">{activeBooking.scheduled_date}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Time</span>
                  <span className="font-bold text-gray-900 dark:text-white">{activeBooking.scheduled_time}</span>
                </div>
                <div className="border-t border-gray-200 dark:border-gray-700 pt-2 flex justify-between">
                  <span className="font-black text-gray-900 dark:text-white">Total</span>
                  <span className="font-black text-teal-600 text-lg">₦{Number(activeBooking.listing_price).toLocaleString()}</span>
                </div>
              </div>

              {loyaltyBalance > 0 && (
                <button onClick={() => setUseCredits(v => !v)}
                  className={`w-full flex items-center justify-between rounded-2xl p-4 mb-4 border-2 transition ${
                    useCredits ? "bg-amber-50 dark:bg-amber-900/20 border-amber-400" : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                  }`}>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🎁</span>
                    <div className="text-left">
                      <p className="font-black text-sm text-gray-900 dark:text-white">Use Loyalty Credits</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">You have ₦{loyaltyBalance.toLocaleString()} available</p>
                    </div>
                  </div>
                  <div className={`w-12 h-6 rounded-full transition-colors flex items-center px-1 ${useCredits ? "bg-amber-400" : "bg-gray-300 dark:bg-gray-600"}`}>
                    <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${useCredits ? "translate-x-6" : "translate-x-0"}`} />
                  </div>
                </button>
              )}

              {useCredits && creditsToApply > 0 && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-3 mb-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-500">Original price</span>
                    <span className="text-gray-500 line-through">₦{listingPrice.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-amber-600 font-bold">Credits applied</span>
                    <span className="text-amber-600 font-bold">- ₦{creditsToApply.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between font-black border-t border-amber-200 dark:border-amber-700 pt-1">
                    <span className="text-gray-900 dark:text-white">You pay</span>
                    <span className="text-teal-600 text-lg">₦{amountAfterCredits.toLocaleString()}</span>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3 mb-5">
                <AlertCircle className="w-4 h-4 text-blue-500 flex-shrink-0" />
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  Payment is processed securely by Flutterwave. The vendor receives their share automatically.
                </p>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setPayingId(null)}
                  className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 rounded-2xl font-bold text-gray-600 dark:text-gray-300 text-sm">
                  Cancel
                </button>
                <button onClick={proceedToFlutterwave}
                  className="flex-1 py-3 bg-gradient-to-r from-teal-500 to-emerald-500 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform">
                  <CreditCard className="w-4 h-4" />
                  {flwReady ? `Pay ₦${amountAfterCredits.toLocaleString()}` : "Loading..."}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 z-40 px-4 py-4">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <button onClick={() => router.back()} className="text-purple-600 p-2 rounded-full hover:bg-purple-50 dark:hover:bg-purple-900/20 transition">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-black bg-gradient-to-r from-purple-600 to-teal-500 bg-clip-text text-transparent">My Bookings</h1>
          <button onClick={loadBookings} className="text-gray-400 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition">
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 pb-44 space-y-4 bg-[#FFF8F0] dark:bg-gray-950 min-h-screen">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(["all", "pending", "confirmed", "cancelled"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-bold capitalize transition ${
                filter === f ? "bg-purple-600 text-white shadow-md" : "bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700"
              }`}>
              {f}{counts[f] > 0 && <span className={`ml-1 text-xs ${filter === f ? "opacity-80" : "text-purple-500"}`}>({counts[f]})</span>}
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-300 font-medium">{error}</p>
          </div>
        )}

        {filtered.length === 0 && !error && (
          <div className="text-center py-20">
            <Calendar className="w-14 h-14 text-gray-300 dark:text-gray-700 mx-auto mb-4" />
            <p className="font-black text-gray-500 dark:text-gray-400 text-lg">No {filter === "all" ? "" : filter} bookings</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
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
                    <p className="font-black text-gray-900 dark:text-white text-base leading-tight">{booking.listing_title}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">by <span className="font-semibold">{booking.vendor_name}</span></p>
                  </div>
                  <span className={`flex-shrink-0 flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold ${cfg.badge}`}>
                    <Icon className="w-3.5 h-3.5" />{cfg.label}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="bg-white/60 dark:bg-gray-800/60 rounded-xl p-2.5 text-center">
                    <Calendar className="w-4 h-4 mx-auto mb-1 text-gray-400" />
                    <p className="text-xs font-bold text-gray-700 dark:text-gray-300">{booking.scheduled_date}</p>
                  </div>
                  <div className="bg-white/60 dark:bg-gray-800/60 rounded-xl p-2.5 text-center">
                    <Clock className="w-4 h-4 mx-auto mb-1 text-gray-400" />
                    <p className="text-xs font-bold text-gray-700 dark:text-gray-300">{booking.scheduled_time}</p>
                  </div>
                  <div className="bg-white/60 dark:bg-gray-800/60 rounded-xl p-2.5 text-center">
                    <p className="text-xs text-gray-400 mb-1">Price</p>
                    <p className="text-xs font-black text-teal-600">₦{Number(booking.listing_price).toLocaleString()}</p>
                  </div>
                </div>

                <p className={`text-xs font-medium mb-3 ${cfg.color}`}>{cfg.message}</p>

                {booking.note && (
                  <div className="bg-white/50 dark:bg-gray-800/40 rounded-xl p-2.5 mb-3">
                    <p className="text-xs text-gray-500 dark:text-gray-400 italic">Note: {booking.note}</p>
                  </div>
                )}

                <div className="flex gap-2">
                  {isConfirmed && (
                    <button onClick={() => handlePay(booking.id)}
                      className="flex-1 py-3 bg-gradient-to-r from-teal-500 to-emerald-500 text-white rounded-xl font-black text-sm flex items-center justify-center gap-2 shadow-md active:scale-95 transition-transform">
                      <CreditCard className="w-4 h-4" /> Pay Now
                    </button>
                  )}
                  {isPending && (
                    <button onClick={() => cancelBooking(booking.id)}
                      className="flex-shrink-0 py-3 px-4 bg-white dark:bg-gray-800 border border-red-200 dark:border-red-800 text-red-500 rounded-xl font-bold text-sm flex items-center gap-1.5">
                      <Ban className="w-4 h-4" /> Cancel
                    </button>
                  )}
                  {booking.status === "cancelled" && (
                    <button onClick={() => router.push("/home")}
                      className="flex-1 py-3 bg-white dark:bg-gray-800 border border-purple-200 dark:border-purple-800 text-purple-600 rounded-xl font-bold text-sm flex items-center justify-center gap-2">
                      Find another vendor <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </>
  );
}
