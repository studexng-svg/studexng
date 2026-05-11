"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Package, CreditCard, ChevronLeft, Shield, Lock, Check,
  Calendar, MapPin, Clock, Loader, Sparkles, ArrowRight, AlertCircle
} from "lucide-react";
import { useCartStore } from "@/lib/cartStore";
import { useBookingStore } from "@/lib/bookingStore";
import { useRouter } from "next/navigation";
import { useAuth, fetchWithAuth } from "@/lib/authStore";
import Script from "next/script";
import { GRAD, GRAD_TEXT, SERIF } from "@/lib/tokens";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

declare global {
  interface Window {
    PaystackPop: { setup: (config: any) => { openIframe: () => void } };
  }
}

export default function CheckoutPage() {
  const router = useRouter();
  const { user, isLoggedIn, isHydrated } = useAuth();
  const { cart, clearCart } = useCartStore();
  const { booking, clearBooking } = useBookingStore();

  const isServiceBooking = !!booking && cart.length === 0;
  const isFoodOrder = cart.length > 0;

  const SERVICE_FEE = 215.56;
  const foodTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const serviceTotal = booking?.total || 0;
  const finalTotal = (isServiceBooking ? serviceTotal : foodTotal) + SERVICE_FEE;

  const [isProcessing, setIsProcessing] = useState(false);
  const [paystackLoaded, setPaystackLoaded] = useState(false);
  const [paymentError, setPaymentError] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if ((window as any).PaystackPop) { setPaystackLoaded(true); return; }

    const interval = setInterval(() => {
      if ((window as any).PaystackPop) { setPaystackLoaded(true); clearInterval(interval); }
    }, 100);

    const fallbackTimeout = setTimeout(() => {
      if ((window as any).PaystackPop) return;
      const script = document.createElement("script");
      script.src = "https://js.paystack.co/v1/inline.js";
      script.onload = () => setPaystackLoaded(true);
      document.head.appendChild(script);
    }, 2000);

    return () => {
      clearInterval(interval);
      clearTimeout(fallbackTimeout);
    };
  }, []);

  const createOrder = async (txRef: string, transactionId: string) => {
    if (isServiceBooking && booking) {
      const res = await fetchWithAuth(`${API_URL}/api/payments/verify/`, {
        method: "POST",
        body: JSON.stringify({
          reference: txRef,
          transaction_id: transactionId,
          listing_id: booking.providerId,
          order_type: "service",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Order creation failed");
      return data.order_id;
    }
    const res = await fetchWithAuth(`${API_URL}/api/payments/verify/`, {
      method: "POST",
      body: JSON.stringify({
        reference: txRef,
        transaction_id: transactionId,
        items: cart.map(item => ({ listing_id: item.id, quantity: item.quantity })),
        order_type: "product",
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Order creation failed");
    return data.order_id;
  };

  const handlePayment = useCallback(async () => {
    const paystackKey = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || "";
    setPaymentError("");

    if (!paystackKey || paystackKey.includes("your_key")) {
      setPaymentError("Payment key not configured. Please contact support.");
      return;
    }
    if (finalTotal <= 0) { setPaymentError("Invalid amount. Please go back and try again."); return; }
    if (!window.PaystackPop) { setPaymentError("Payment system not ready. Please refresh the page."); return; }

    const listingId = isServiceBooking ? booking?.providerId : cart[0]?.id;
    if (!listingId) {
      setPaymentError("Could not determine listing. Please go back and try again.");
      return;
    }

    setIsProcessing(true);

    try {
      const initRes = await fetchWithAuth(`${API_URL}/api/payments/initialize/`, {
        method: "POST",
        body: JSON.stringify({ listing_id: listingId }),
      });
      const initData = await initRes.json();
      if (!initRes.ok) throw new Error(initData.error || "Failed to initialize payment");

      const { access_code, reference, amount_kobo } = initData;
      if (!access_code) throw new Error("Payment initialization incomplete. Please try again.");

      const handler = window.PaystackPop.setup({
        key: paystackKey,
        access_code,
        email: user?.email || "user@studex.ng",
        amount: amount_kobo ?? Math.round(finalTotal * 100),
        currency: "NGN",
        ref: reference,
        callback: function(response: any) {
          if (response.status === "success") {
            createOrder(response.reference, response.reference)
              .then(orderId => {
                if (isFoodOrder) clearCart();
                if (isServiceBooking) clearBooking();
                router.push(`/order-confirmation/${orderId}`);
              })
              .catch(() => {
                setPaymentError(`Payment received but order failed. Save this reference and contact support: ${response.reference}`);
                setIsProcessing(false);
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
      setPaymentError(err.message || "Payment failed. Please try again.");
      setIsProcessing(false);
    }
  }, [finalTotal, user, isFoodOrder, isServiceBooking, booking, cart, paystackLoaded]);

  // ── EMPTY STATE ──────────────────────────────────────────────────────────
  if (!isFoodOrder && !isServiceBooking) {
    return (
      <div className="min-h-screen bg-[#FAFAF9] flex flex-col items-center justify-center px-6 pb-28"
        style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <div className="text-center">
          <div className="w-24 h-24 mx-auto mb-6 rounded-2xl flex items-center justify-center"
            style={{ background: GRAD }}>
            <Package className="w-12 h-12 text-white" strokeWidth={1.5} />
          </div>
          <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-semibold mb-2">Empty</p>
          <h2 className="text-2xl font-bold text-stone-900 mb-2" style={SERIF}>
            Nothing to checkout
          </h2>
          <p className="text-stone-400 text-sm mb-8">Go book a service or add items to your cart first.</p>
          <Link href="/home">
            <button
              className="px-8 py-3 text-white font-semibold rounded-full shadow-lg shadow-teal-200/60 inline-flex items-center gap-2 text-sm transition active:scale-[0.98]"
              style={{ background: GRAD }}>
              Explore StudEx <ArrowRight className="w-4 h-4" />
            </button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF9]" style={{ fontFamily: "'DM Sans', sans-serif" }}>

      {/* ── STICKY HEADER ── */}
      <div className="sticky top-0 bg-white/80 backdrop-blur-md z-40 border-b border-stone-100 shadow-sm">
        <div className="flex items-center justify-between px-4 py-3 max-w-2xl mx-auto">
          <Link href={isServiceBooking ? `/listing/${booking?.providerId}` : "/cart"}>
            <button className="p-2.5 bg-white border border-stone-200 hover:border-stone-300 rounded-full shadow-sm transition-all active:scale-95">
              <ChevronLeft className="w-5 h-5 text-stone-600" />
            </button>
          </Link>
          <div className="text-center">
            <h1 className="text-base font-bold text-stone-900" style={SERIF}>
              Secure Checkout
            </h1>
            <p className="text-xs text-stone-400 flex items-center gap-1 justify-center mt-0.5">
              <Shield className="w-3 h-3" /> Powered by Paystack
            </p>
          </div>
          <div className="w-10" />
        </div>
      </div>

      <div className="px-4 pt-6 pb-28 max-w-2xl mx-auto space-y-4">

        {/* ── SECTION HEADER ── */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-semibold">
            {isServiceBooking ? "Service Booking" : "Product Order"}
          </p>
          <h2 className="text-xl font-bold text-stone-900 mt-0.5" style={SERIF}>
            Review your order
          </h2>
        </motion.div>

        {/* ── SERVICE BOOKING DETAILS ── */}
        {isServiceBooking && booking && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: GRAD }}>
                <Calendar className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-semibold text-stone-900 text-sm">{booking.providerName}</p>
                <p className="text-xs text-teal-600 font-medium">Service Booking</p>
              </div>
            </div>
            <div className="space-y-2.5 bg-stone-50 rounded-xl p-4">
              <div className="flex items-center gap-2.5 text-sm text-stone-600">
                <Calendar className="w-4 h-4 text-teal-500 flex-shrink-0" />
                <span>{booking.date}</span>
              </div>
              <div className="flex items-center gap-2.5 text-sm text-stone-600">
                <Clock className="w-4 h-4 text-teal-500 flex-shrink-0" />
                <span>{booking.time}</span>
              </div>
              <div className="flex items-center gap-2.5 text-sm text-stone-600">
                <MapPin className="w-4 h-4 text-teal-500 flex-shrink-0" />
                <span>{booking.location}</span>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── CART ITEMS ── */}
        {isFoodOrder && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Package className="w-4 h-4 text-teal-600" />
              <p className="font-semibold text-stone-900 text-sm">Order Items</p>
            </div>
            {cart.map((item, i) => (
              <motion.div key={item.id}
                initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.07 }}
                className="flex justify-between items-center py-2.5 border-b border-stone-100 last:border-0">
                <div>
                  <p className="font-medium text-stone-900 text-sm">{item.title}</p>
                  <p className="text-xs text-stone-400 mt-0.5">× {item.quantity}</p>
                </div>
                <p className="font-semibold text-sm" style={GRAD_TEXT}>
                  ₦{(item.price * item.quantity).toLocaleString()}
                </p>
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* ── ORDER SUMMARY ── */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm">
          <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-semibold mb-4">Order Summary</p>
          <div className="space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-stone-500">
                {isServiceBooking ? "Service price" : "Items total"}
              </span>
              <span className="text-stone-700 font-medium">
                ₦{(finalTotal - SERVICE_FEE).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-stone-500">Service fee</span>
              <span className="text-stone-700 font-medium">₦{SERVICE_FEE.toLocaleString()}</span>
            </div>
            <div className="border-t border-stone-100 pt-3 flex justify-between items-center">
              <span className="font-bold text-stone-900" style={SERIF}>Total</span>
              <span className="text-2xl font-bold" style={GRAD_TEXT}>
                ₦{finalTotal.toLocaleString()}
              </span>
            </div>
          </div>
        </motion.div>

        {/* ── SECURITY BADGES ── */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-around text-center">
            <div className="flex flex-col items-center gap-1.5">
              <div className="w-9 h-9 rounded-xl bg-teal-50 flex items-center justify-center">
                <Shield className="w-4 h-4 text-teal-600" />
              </div>
              <p className="text-xs font-medium text-stone-500">Secure</p>
            </div>
            <div className="w-px h-8 bg-stone-100" />
            <div className="flex flex-col items-center gap-1.5">
              <div className="w-9 h-9 rounded-xl bg-teal-50 flex items-center justify-center">
                <Lock className="w-4 h-4 text-teal-600" />
              </div>
              <p className="text-xs font-medium text-stone-500">Encrypted</p>
            </div>
            <div className="w-px h-8 bg-stone-100" />
            <div className="flex flex-col items-center gap-1.5">
              <div className="w-9 h-9 rounded-xl bg-teal-50 flex items-center justify-center">
                <Check className="w-4 h-4 text-teal-600" />
              </div>
              <p className="text-xs font-medium text-stone-500">Protected</p>
            </div>
          </div>
        </motion.div>

        {/* ── SERVICE FEE INFO ── */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="bg-teal-50 border border-teal-200 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <Sparkles className="w-4 h-4 text-teal-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-teal-800 text-sm">Transparent Pricing</p>
              <p className="text-xs text-teal-600 mt-0.5 leading-relaxed">
                A flat <strong>₦215.56 service fee</strong> is included in your total.
                The vendor receives their full listed price.
                Refunds are processed back to your original payment method.
              </p>
            </div>
          </div>
        </motion.div>

        {/* ── PAYMENT ERROR ── */}
        {paymentError && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-red-700 text-sm font-medium">{paymentError}</p>
          </div>
        )}

        {/* ── PAY BUTTON ── */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
          <form onSubmit={e => { e.preventDefault(); handlePayment(); }}>
            <motion.button
              type="submit"
              whileHover={{ scale: isProcessing ? 1 : 1.02 }}
              whileTap={{ scale: isProcessing ? 1 : 0.97 }}
              disabled={isProcessing || !isLoggedIn || !paystackLoaded}
              className="w-full py-4 rounded-full font-semibold text-white text-base shadow-lg shadow-teal-200/60 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: GRAD }}>
              {isProcessing ? (
                <><Loader className="w-5 h-5 animate-spin" /> Processing...</>
              ) : (
                <><CreditCard className="w-5 h-5" /> Pay ₦{finalTotal.toLocaleString()} Now</>
              )}
            </motion.button>
          </form>
        </motion.div>

        <p className="text-center text-xs text-stone-400 pb-4">
          By completing this purchase you agree to StudEx{" "}
          <Link href="/terms" className="text-teal-600 hover:underline font-medium">
            Terms & Conditions
          </Link>
        </p>

      </div>

      <Script
        src="https://js.paystack.co/v1/inline.js"
        strategy="beforeInteractive"
      />
    </div>
  );
}
