"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import {
  Package, CreditCard, ArrowLeft, Shield, Lock, Sparkles, Check,
  Calendar, MapPin, Clock, Building2, Loader, Tag,
} from "lucide-react";
import { useCartStore } from "@/lib/cartStore";
import { useBookingStore } from "@/lib/bookingStore";
import { useRouter } from "next/navigation";
import { useAuth, fetchWithAuth } from "@/lib/authStore";
import { usePaystackPayment } from "react-paystack";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

interface PricePreview {
  original_amount: string;
  discount_eligible: boolean;
  discount_percent: number;
  discount_amount: string;
  final_amount: string;
  discount_message: string | null;
}

export default function CheckoutPage() {
  const router = useRouter();
  const { user, isAuthReady, isLoggedIn, isHydrated } = useAuth();
  const { cart, clearCart } = useCartStore();
  const { booking, clearBooking } = useBookingStore();

  const isServiceBooking = !!booking && cart.length === 0;
  const isFoodOrder = cart.length > 0;

  const rawTotal = isServiceBooking
    ? (booking?.total || 0)
    : cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  // ── Discount state ────────────────────────────────────────────────────────
  const [pricePreview, setPricePreview] = useState<PricePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // The amount we actually charge Paystack — starts as raw total, updated after preview
  const [chargeAmount, setChargeAmount] = useState(rawTotal);

  useEffect(() => {
    if (!user || rawTotal <= 0) return;

    const fetchPreview = async () => {
      setPreviewLoading(true);
      try {
        const res = await fetchWithAuth(`${API_URL}/api/payments/preview/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: rawTotal }),
        });
        if (res.ok) {
          const data: PricePreview = await res.json();
          setPricePreview(data);
          setChargeAmount(parseFloat(data.final_amount));
        }
      } catch (e) {
        console.warn("Price preview failed, using full price", e);
        setChargeAmount(rawTotal);
      } finally {
        setPreviewLoading(false);
      }
    };

    fetchPreview();
  }, [user, rawTotal]);

  const chargeAmountInKobo = Math.round(chargeAmount * 100);

  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "transfer">("card");

  const referenceRef = useRef(
    `STUDEX-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`
  );

  const config = {
    reference: referenceRef.current,
    email: user?.email || "user@studex.com",
    amount: chargeAmountInKobo,  // ← discounted amount sent to Paystack
    publicKey: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY!,
    channels:
      paymentMethod === "transfer"
        ? ["bank_transfer"]
        : ["card", "bank", "ussd", "bank_transfer"],
    metadata: {
      custom_fields: [
        { display_name: "Customer", variable_name: "customer", value: user?.username || "" },
        {
          display_name: "Order Type",
          variable_name: "type",
          value: isServiceBooking ? "service_booking" : "product_order",
        },
      ],
    },
  };

  const initializePayment = usePaystackPayment(config);

  const createOrder = async (paymentRef: string) => {
    if (isServiceBooking && booking) {
      const res = await fetchWithAuth(`${API_URL}/api/payments/verify/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reference: paymentRef,
          listing_id: booking.providerId,
          order_type: "service",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Order creation failed");
      return data;
    }

    const res = await fetchWithAuth(`${API_URL}/api/payments/verify/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reference: paymentRef,
        items: cart.map((item) => ({
          listing_id: item.id,
          quantity: item.quantity,
        })),
        order_type: "product",
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Order creation failed");
    return data;
  };

  const handlePayment = useCallback(() => {
    if (!config.publicKey) {
      alert("Paystack key missing. Check your .env file.");
      return;
    }
    if (chargeAmountInKobo <= 0) {
      alert("Cannot process zero payment.");
      return;
    }

    setIsProcessing(true);

    initializePayment({
      onSuccess: async (ref: any) => {
        if (!isLoggedIn) {
          router.push("/auth");
          return;
        }
        try {
          const result = await createOrder(ref.reference);
          if (isFoodOrder) clearCart();
          if (isServiceBooking) clearBooking();
          router.push(`/order-confirmation/${result.order_id}`);
        } catch (error: any) {
          console.error("Order creation failed:", error.message);
          alert(
            `Payment received but order failed. Contact support with ref: ${ref.reference}`
          );
          setIsProcessing(false);
        }
      },
      onClose: () => {
        setIsProcessing(false);
      },
    });
  }, [initializePayment, chargeAmountInKobo, isLoggedIn, isFoodOrder, isServiceBooking]);

  // ── Empty state ───────────────────────────────────────────────────────────
  if (!isFoodOrder && !isServiceBooking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-teal-50 flex items-center justify-center p-6">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center"
        >
          <Package className="w-32 h-32 text-purple-300 mx-auto mb-8" />
          <h2 className="text-4xl font-black bg-gradient-to-r from-purple-600 to-teal-600 bg-clip-text text-transparent mb-4">
            Nothing to checkout
          </h2>
          <p className="text-gray-600 mb-8">Go book a service or add items to cart!</p>
          <Link href="/home">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-12 py-5 bg-gradient-to-r from-purple-600 to-teal-600 text-white font-black text-xl rounded-full shadow-2xl"
            >
              Explore StudEx
            </motion.button>
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <>
      {/* TOP BAR */}
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="sticky top-0 bg-white/95 backdrop-blur-xl z-50 border-b border-purple-100 shadow-lg"
      >
        <div className="flex items-center justify-between px-6 py-5 max-w-4xl mx-auto">
          <Link href={isServiceBooking ? `/lashes/${booking?.providerId}` : "/cart"}>
            <motion.div
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="p-2 hover:bg-purple-100 rounded-full transition"
            >
              <ArrowLeft className="w-7 h-7 text-purple-600" />
            </motion.div>
          </Link>
          <div className="text-center">
            <h1 className="text-2xl font-black bg-gradient-to-r from-purple-600 to-teal-600 bg-clip-text text-transparent">
              Secure Checkout
            </h1>
            <p className="text-xs text-gray-500 flex items-center gap-1 justify-center">
              <Shield className="w-3 h-3" /> Powered by Paystack
            </p>
          </div>
          <div className="w-10" />
        </div>
      </motion.div>

      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-teal-50 px-6 pt-8 pb-32 max-w-4xl mx-auto">

        {/* ORDER SUMMARY */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/90 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white mb-6"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-black text-gray-900 flex items-center gap-3">
              {isServiceBooking ? (
                <Calendar className="w-7 h-7 text-purple-600" />
              ) : (
                <Package className="w-7 h-7 text-purple-600" />
              )}
              {isServiceBooking ? "Your Appointment" : "Your Order"}
            </h2>
            <Sparkles className="w-6 h-6 text-teal-500" />
          </div>

          <div className="space-y-5">
            {/* SERVICE BOOKING */}
            {isServiceBooking && booking && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-gradient-to-r from-purple-100 to-teal-100 rounded-3xl p-8"
              >
                <div className="flex items-center gap-5 mb-6">
                  <div className="relative w-24 h-24 rounded-3xl overflow-hidden ring-4 ring-purple-200">
                    <Image
                      src={`/images/${booking.providerImg}`}
                      alt={booking.providerName}
                      fill
                      className="object-cover"
                    />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black">{booking.providerName}</h3>
                    <p className="text-purple-700 font-bold">Service Booking</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 text-lg">
                  <div className="flex items-center gap-3">
                    <Calendar className="w-5 h-5" />
                    <span className="font-medium">{booking.date}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Clock className="w-5 h-5" />
                    <span className="font-medium">{booking.time}</span>
                  </div>
                  <div className="flex items-center gap-3 col-span-2">
                    <MapPin className="w-5 h-5" />
                    <span className="font-medium">{booking.location}</span>
                  </div>
                </div>
              </motion.div>
            )}

            {/* PRODUCT/FOOD CART */}
            {isFoodOrder &&
              cart.map((item, i) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="flex justify-between items-center p-4 bg-gradient-to-r from-purple-50 to-teal-50 rounded-2xl"
                >
                  <div className="flex-1">
                    <p className="font-bold text-gray-900 text-lg">{item.title}</p>
                    <p className="text-sm text-purple-600 font-medium">×{item.quantity}</p>
                  </div>
                  <p className="font-black text-xl text-purple-600">
                    ₦{(item.price * item.quantity).toLocaleString()}
                  </p>
                </motion.div>
              ))}

            {/* ── PRICE BREAKDOWN (with discount) ── */}
            <div className="border-t-2 border-purple-200 pt-6 mt-6 space-y-3">

              {previewLoading ? (
                <div className="animate-pulse h-20 bg-purple-50 rounded-2xl" />
              ) : (
                <>
                  {/* Original price line */}
                  <div className="flex justify-between items-center text-base">
                    <span className="text-gray-500 font-medium">Service Price</span>
                    <span className="font-bold text-gray-700">
                      ₦{rawTotal.toLocaleString()}
                    </span>
                  </div>

                  {/* Discount line — only if eligible */}
                  {pricePreview?.discount_eligible && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex justify-between items-center text-base"
                    >
                      <span className="text-green-600 font-bold flex items-center gap-2">
                        <Tag className="w-4 h-4" />
                        Profile Discount ({pricePreview.discount_percent}% off)
                      </span>
                      <span className="text-green-600 font-black">
                        −₦{Number(pricePreview.discount_amount).toLocaleString()}
                      </span>
                    </motion.div>
                  )}

                  {/* Platform fee */}
                  <div className="flex justify-between items-center text-base">
                    <span className="text-gray-500 font-medium">Platform Fee</span>
                    <span className="text-green-600 font-bold">Included</span>
                  </div>

                  {/* Total */}
                  <motion.div
                    initial={{ scale: 0.97 }}
                    animate={{ scale: 1 }}
                    className="bg-gradient-to-r from-purple-600 to-teal-600 rounded-2xl p-6 text-white mt-2"
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-xl font-bold">Total Amount</span>
                      <div className="text-right">
                        {pricePreview?.discount_eligible && (
                          <p className="text-sm line-through opacity-60 text-right">
                            ₦{rawTotal.toLocaleString()}
                          </p>
                        )}
                        <span className="text-4xl font-black">
                          ₦{chargeAmount.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </motion.div>

                  {/* Discount banner */}
                  {pricePreview?.discount_eligible && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-green-50 border-2 border-green-200 rounded-2xl p-4 text-center"
                    >
                      <p className="text-green-700 font-black text-sm">
                        {pricePreview.discount_message}
                      </p>
                      <p className="text-green-600 text-xs mt-1">
                        One-time reward for completing your profile ✓
                      </p>
                    </motion.div>
                  )}
                </>
              )}
            </div>
          </div>
        </motion.div>

        {/* PAYMENT METHOD SELECTION */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-4 mb-6"
        >
          <h2 className="text-xl font-black text-gray-900">Choose Payment Method</h2>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setPaymentMethod("card")}
            className={`w-full rounded-2xl p-6 transition-all text-left ${
              paymentMethod === "card"
                ? "bg-gradient-to-r from-purple-600 to-teal-600 text-white shadow-xl"
                : "bg-white text-gray-800 shadow-md"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <CreditCard className="w-8 h-8" />
                <div>
                  <p className="text-xl font-black">Card / USSD / Bank</p>
                  <p className={`text-sm font-medium ${paymentMethod === "card" ? "opacity-90" : "text-gray-600"}`}>
                    Visa, Mastercard, Verve, USSD
                  </p>
                </div>
              </div>
              {paymentMethod === "card" && <Check className="w-8 h-8" />}
            </div>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setPaymentMethod("transfer")}
            className={`w-full rounded-2xl p-6 transition-all text-left ${
              paymentMethod === "transfer"
                ? "bg-gradient-to-r from-purple-600 to-teal-600 text-white shadow-xl"
                : "bg-white text-gray-800 shadow-md"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Building2 className="w-8 h-8" />
                <div>
                  <p className="text-xl font-black">Bank Transfer</p>
                  <p className={`text-sm font-medium ${paymentMethod === "transfer" ? "opacity-90" : "text-gray-600"}`}>
                    Opay, Palmpay, GTB, Access & all banks
                  </p>
                </div>
              </div>
              {paymentMethod === "transfer" && <Check className="w-8 h-8" />}
            </div>
          </motion.button>
        </motion.div>

        {/* BANK TRANSFER NOTE */}
        {paymentMethod === "transfer" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-6"
          >
            <p className="text-blue-800 font-bold text-sm">How bank transfer works:</p>
            <p className="text-blue-700 text-sm mt-1">
              After clicking Pay, Paystack will generate a unique account number for this
              transaction. Transfer the exact amount from any bank app and your order will
              be confirmed automatically.
            </p>
          </motion.div>
        )}

        {/* SECURITY BADGES */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white/90 backdrop-blur-xl rounded-3xl p-6 shadow-xl border border-white mb-6"
        >
          <div className="flex items-center justify-center gap-8 text-center">
            {[
              { icon: Shield, label: "Secure",    color: "text-green-600"  },
              { icon: Lock,   label: "Encrypted", color: "text-blue-600"   },
              { icon: Check,  label: "Protected", color: "text-purple-600" },
            ].map(({ icon: Icon, label, color }) => (
              <div key={label} className="flex flex-col items-center">
                <Icon className={`w-10 h-10 ${color} mb-2`} />
                <p className="text-xs font-bold text-gray-700">{label}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* SPLIT PAYMENT INFO */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-purple-50 border-2 border-purple-200 rounded-2xl p-6 mb-8 text-center"
        >
          <Shield className="w-12 h-12 text-purple-600 mx-auto mb-3" />
          <p className="font-black text-lg text-gray-900">Automatic Split Payment</p>
          <p className="text-sm text-gray-700 mt-2">
            Your payment is split automatically by Paystack — 70% goes directly to the
            seller, 30% to StudEx. Refunds are processed back to your original payment
            method instantly.
          </p>
        </motion.div>

        {/* PAY BUTTON */}
        <motion.button
          whileHover={{ scale: isProcessing ? 1 : 1.02 }}
          whileTap={{ scale: isProcessing ? 1 : 0.98 }}
          onClick={handlePayment}
          disabled={isProcessing || !isLoggedIn || previewLoading}
          className={`w-full py-8 rounded-3xl font-black text-3xl shadow-2xl
            bg-gradient-to-r from-purple-600 to-teal-600 text-white
            flex items-center justify-center gap-4
            ${(isProcessing || !isAuthReady || !isHydrated || previewLoading)
              ? "opacity-70 cursor-not-allowed"
              : "hover:shadow-purple-500/50"}`}
        >
          {isProcessing ? (
            <>
              <Loader className="w-8 h-8 animate-spin" />
              Processing...
            </>
          ) : previewLoading ? (
            <>
              <Loader className="w-8 h-8 animate-spin" />
              Loading price...
            </>
          ) : (
            <>
              <CreditCard className="w-10 h-10" />
              Pay ₦{chargeAmount.toLocaleString()} Now
            </>
          )}
        </motion.button>

        <p className="text-center text-xs text-gray-600 mt-6">
          By completing this purchase you agree to StudEx{" "}
          <Link href="/terms" className="text-purple-600 underline font-bold">
            Terms & Conditions
          </Link>
        </p>
      </div>
    </>
  );
}