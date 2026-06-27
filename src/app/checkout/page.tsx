"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Package, CreditCard, Shield, Lock, Check,
  Calendar, MapPin, Clock, Loader, Sparkles, ArrowRight, AlertCircle
} from "lucide-react";
import { useCartStore } from "@/lib/cartStore";
import { useBookingStore } from "@/lib/bookingStore";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/authStore";
import Script from "next/script";
import { GRAD, GRAD_TEXT, TEAL, PURPLE, calcServiceFee } from "@/lib/tokens";

const JAKARTA = { fontFamily: "'Plus Jakarta Sans', sans-serif" };
import TopNav from "@/components/layout/TopNav";
import { api } from "@/lib/api";

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

  const foodTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const dealSavings = cart.reduce((sum, item) => {
    const orig = item.original_price ?? item.price;
    return sum + Math.max(orig - item.price, 0) * item.quantity;
  }, 0);
  const serviceTotal = booking?.total || 0;
  const baseTotal = isServiceBooking ? serviceTotal : foodTotal;

  const [isProcessing, setIsProcessing] = useState(false);
  const [paystackLoaded, setPaystackLoaded] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [deliveryLocation, setDeliveryLocation] = useState("");
  const [discount, setDiscount] = useState<{
    hasDiscount: boolean;
    discountAmount: number;
    finalBase: number;
  } | null>(null);
  const [loyaltyBalance, setLoyaltyBalance] = useState(0);
  const [useCredits, setUseCredits] = useState(false);

  const discountedBase = discount ? discount.finalBase : baseTotal;
  const fullCheckoutAmount = discountedBase + calcServiceFee(discountedBase);
  const creditsToApply = useCredits ? Math.min(loyaltyBalance, fullCheckoutAmount) : 0;
  const isFullyCoveredByCredits = useCredits && creditsToApply >= fullCheckoutAmount && fullCheckoutAmount > 0;
  const baseAfterCredits = isFullyCoveredByCredits ? 0 : Math.max(discountedBase - creditsToApply, 0);
  const serviceFee = isFullyCoveredByCredits ? 0 : calcServiceFee(baseAfterCredits);
  const finalTotal = isFullyCoveredByCredits ? 0 : baseAfterCredits + serviceFee;

  useEffect(() => {
    if (!isLoggedIn || !isHydrated || baseTotal <= 0) return;
    api.payments.previewPrice({ amount: baseTotal })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setDiscount({
            hasDiscount: data.discount_eligible,
            discountAmount: parseFloat(data.discount_amount),
            finalBase: parseFloat(data.final_amount),
          });
        }
      })
      .catch(() => {});
  }, [isLoggedIn, isHydrated, baseTotal]);

  useEffect(() => {
    if (!isLoggedIn) return;
    api.loyalty.status()
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setLoyaltyBalance(parseFloat(d.credit_balance) || 0); })
      .catch(() => {});
  }, [isLoggedIn]);

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

  const createOrder = async (txRef: string, transactionId: string, appliedCredits = 0) => {
    if (isServiceBooking && booking) {
      const res = await api.payments.verify({
        reference: txRef,
        transaction_id: transactionId,
        listing_id: booking.providerId,
        order_type: "service",
        use_credits: appliedCredits > 0,
        credits_applied: appliedCredits,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Order creation failed");
      return data.order_id;
    }
    const res = await api.payments.verify({
      reference: txRef,
      transaction_id: transactionId,
      items: cart.map(item => ({ listing_id: item.id, quantity: item.quantity })),
      order_type: "product",
      delivery_location: deliveryLocation.trim(),
      use_credits: appliedCredits > 0,
      credits_applied: appliedCredits,
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
    if (!isFullyCoveredByCredits && finalTotal <= 0) { setPaymentError("Invalid amount. Please go back and try again."); return; }
    if (!isFullyCoveredByCredits && !window.PaystackPop) { setPaymentError("Payment system not ready. Please refresh the page."); return; }
    if (isFoodOrder && !deliveryLocation.trim()) { setPaymentError("Please enter your campus delivery location."); return; }

    const listingId = isServiceBooking ? booking?.providerId : cart[0]?.id;
    if (!listingId) {
      setPaymentError("Could not determine listing. Please go back and try again.");
      return;
    }

    setIsProcessing(true);

    // Full credits coverage — skip Paystack, StudEx pays vendor directly
    if (isFullyCoveredByCredits) {
      try {
        const res = await api.payments.payWithCredits({ listing_id: listingId });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Payment failed");
        if (isFoodOrder) clearCart();
        if (isServiceBooking) clearBooking();
        router.push(`/order-confirmation/${data.order_id}`);
      } catch (err: any) {
        setPaymentError(err.message || "Payment failed. Please try again.");
        setIsProcessing(false);
      }
      return;
    }

    try {
      const initRes = await api.payments.initialize({
        listing_id: listingId,
        ...(isFoodOrder ? { cart_amount: foodTotal } : {}),
        ...(isFoodOrder && deliveryLocation.trim() ? { delivery_location: deliveryLocation.trim() } : {}),
        ...(useCredits && creditsToApply > 0 ? { use_credits: true } : {}),
      });
      const initData = await initRes.json();
      if (!initRes.ok) throw new Error(initData.error || "Failed to initialize payment");

      const { access_code, reference, amount_kobo, credits_applied: serverCredits } = initData;
      if (!access_code) throw new Error("Payment initialization incomplete. Please try again.");

      const appliedCredits = serverCredits ?? 0;

      const handler = window.PaystackPop.setup({
        key: paystackKey,
        access_code,
        email: user?.email || "user@studex.ng",
        amount: amount_kobo ?? Math.round(finalTotal * 100),
        currency: "NGN",
        ref: reference,
        callback: function(response: any) {
          if (response.status === "success") {
            createOrder(response.reference, response.reference, appliedCredits)
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
  }, [finalTotal, foodTotal, user, isFoodOrder, isServiceBooking, booking, cart, paystackLoaded, deliveryLocation, useCredits, creditsToApply, isFullyCoveredByCredits]);

  // ── EMPTY STATE ──────────────────────────────────────────────────────────
  if (!isFoodOrder && !isServiceBooking) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex flex-col items-center justify-center px-6 pb-28"
        style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <div className="text-center">
          <div className="w-24 h-24 mx-auto mb-6 rounded-2xl flex items-center justify-center"
            style={{ background: TEAL }}>
            <Package className="w-12 h-12 text-white" strokeWidth={1.5} />
          </div>
          <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-semibold mb-2">Empty</p>
          <h2 className="text-2xl font-bold text-stone-900 mb-2" style={JAKARTA}>
            Nothing to checkout
          </h2>
          <p className="text-stone-400 text-sm mb-8">Go book a service or add items to your cart first.</p>
          <Link href="/home">
            <button
              className="px-8 py-3 text-white font-semibold rounded-full shadow-lg shadow-teal-200/60 inline-flex items-center gap-2 text-sm transition active:scale-[0.98]"
              style={{ background: TEAL }}>
              Explore StudEx <ArrowRight className="w-4 h-4" />
            </button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <TopNav showBack />

      <div className="px-4 pt-6 pb-28 max-w-2xl mx-auto space-y-4">

        {/* ── SECTION HEADER ── */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-semibold">
            {isServiceBooking ? "Service Booking" : "Product Order"}
          </p>
          <h2 className="text-xl font-bold text-stone-900 mt-0.5" style={JAKARTA}>
            Review your order
          </h2>
        </motion.div>

        {/* ── SERVICE BOOKING DETAILS ── */}
        {isServiceBooking && booking && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: PURPLE }}>
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
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs text-stone-400">× {item.quantity}</p>
                    {item.original_price && item.original_price > item.price && (
                      <span className="text-xs bg-rose-100 text-rose-600 font-semibold px-1.5 py-0.5 rounded-full">
                        -{item.deal_discount_percent}%
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  {item.original_price && item.original_price > item.price && (
                    <p className="text-xs text-stone-400 line-through">
                      ₦{(item.original_price * item.quantity).toLocaleString()}
                    </p>
                  )}
                  <p className="font-semibold text-sm" style={GRAD_TEXT}>
                    ₦{(item.price * item.quantity).toLocaleString()}
                  </p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* ── DELIVERY LOCATION (products only) ── */}
        {isFoodOrder && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
            className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <MapPin className="w-4 h-4 text-teal-600" />
              <p className="font-semibold text-stone-900 text-sm">Delivery Location</p>
            </div>
            <p className="text-xs text-stone-400">Must be within school surroundings. Specify your hostel, hall, or landmark.</p>
            {user?.school?.toLowerCase() === "futo" ? (
              <select
                value={deliveryLocation}
                onChange={e => setDeliveryLocation(e.target.value)}
                className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-400 transition appearance-none"
              >
                <option value="">Select delivery location</option>
                <option>Love Garden</option>
                <option>Tetfund</option>
                <option>SEET Roundabout</option>
                <option>ICT</option>
              </select>
            ) : (
              <input
                type="text"
                value={deliveryLocation}
                onChange={e => setDeliveryLocation(e.target.value)}
                placeholder={user?.school?.toLowerCase() === "imsu" ? "e.g. Orji, World Bank, Aladinma…" : "e.g. Love Garden"}
                className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-teal-400 transition"
              />
            )}
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
              <div className="text-right">
                {dealSavings > 0 && (
                  <p className="text-xs text-stone-400 line-through">
                    ₦{(baseTotal + dealSavings).toLocaleString()}
                  </p>
                )}
                <span className={`font-medium ${discount?.hasDiscount ? "line-through text-stone-400" : "text-stone-700"}`}>
                  ₦{baseTotal.toLocaleString()}
                </span>
              </div>
            </div>
            {dealSavings > 0 && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-rose-600 font-medium flex items-center gap-1">
                  Deal savings
                </span>
                <span className="text-rose-600 font-semibold">
                  -₦{dealSavings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            )}
            {discount?.hasDiscount && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-emerald-600 font-medium flex items-center gap-1">
                  🎉 Profile bonus (5% off)
                </span>
                <span className="text-emerald-600 font-semibold">
                  -₦{discount.discountAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            )}

            {/* Loyalty credits toggle */}
            <div className={`flex items-center justify-between rounded-xl px-3 py-2.5 border transition ${loyaltyBalance > 0 ? (useCredits ? "bg-amber-50 border-amber-300" : "bg-stone-50 border-stone-200 cursor-pointer") : "bg-stone-50 border-stone-100 opacity-50"}`}
              onClick={() => loyaltyBalance > 0 && setUseCredits(v => !v)}>
              <div className="flex items-center gap-2">
                <span className="text-lg">🎁</span>
                <div>
                  <p className="text-sm font-semibold text-stone-800 leading-tight">Loyalty Credits</p>
                  <p className="text-xs text-stone-500">
                    {loyaltyBalance > 0 ? `₦${loyaltyBalance.toLocaleString()} available` : "No credits yet"}
                  </p>
                </div>
              </div>
              <div className={`w-11 h-6 rounded-full flex items-center px-1 transition-colors ${loyaltyBalance > 0 && useCredits ? "bg-amber-400" : "bg-stone-300"}`}>
                <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${loyaltyBalance > 0 && useCredits ? "translate-x-5" : "translate-x-0"}`} />
              </div>
            </div>

            {useCredits && creditsToApply > 0 && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-amber-600 font-medium">🎁 Credits applied</span>
                <span className="text-amber-600 font-semibold">
                  -₦{creditsToApply.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            )}
            {isFullyCoveredByCredits && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-emerald-600 font-medium">Service fee</span>
                <span className="text-emerald-600 font-semibold">₦0.00 (covered)</span>
              </div>
            )}

            <div className="flex justify-between items-center text-sm">
              <span className="text-stone-500">Service fee (8%)</span>
              <span className="text-stone-700 font-medium">₦{serviceFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="border-t border-stone-100 pt-3 flex justify-between items-center">
              <span className="font-bold text-stone-900" style={JAKARTA}>Total</span>
              <span className="text-2xl font-bold" style={GRAD_TEXT}>
                ₦{finalTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
            <div>
              <p className="font-semibold text-teal-800 text-sm">Transparent Pricing</p>
              <p className="text-xs text-teal-600 mt-0.5 leading-relaxed">
                Our <strong>8% service fee</strong> (min ₦100, max ₦3,500) covers both the StudEx platform and Paystack's payment processing cost so there are <strong>no hidden charges</strong> on top of what you see here.
                {dealSavings > 0 && " Deal discounts are already reflected in your items total."}
                {discount?.hasDiscount && " Your 5% profile completion bonus has been applied."}
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
              style={{ background: TEAL }}>
              {isProcessing ? (
                <><Loader className="w-5 h-5 animate-spin" /> Processing...</>
              ) : isFullyCoveredByCredits ? (
                <><span className="text-lg">🎁</span> Redeem Credits & Place Order</>
              ) : (
                <><CreditCard className="w-5 h-5" /> Pay ₦{finalTotal.toLocaleString()} Now</>
              )}
            </motion.button>
          </form>
        </motion.div>

        <div className="flex flex-col items-center gap-3 pb-4">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-sm text-stone-500 hover:text-stone-700 transition font-medium">
            ← Cancel and go back
          </button>
          <p className="text-center text-xs text-stone-400">
            By completing this purchase you agree to StudEx{" "}
            <Link href="/terms" className="text-teal-600 hover:underline font-medium">
              Terms & Conditions
            </Link>
          </p>
        </div>

      </div>

      <Script
        src="https://js.paystack.co/v1/inline.js"
        strategy="beforeInteractive"
      />
    </div>
  );
}
