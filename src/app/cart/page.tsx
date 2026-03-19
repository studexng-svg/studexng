// src/app/cart/page.tsx
"use client";

import { Plus, Minus, Trash2, ShoppingBag, ArrowRight, Sparkles, AlertCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useCartStore } from "@/lib/cartStore";
import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export default function CartPage() {
  const router = useRouter();
  const { cart, removeFromCart, updateQuantity, clearCart } = useCartStore();

  const handleBack = () => {
    try {
      const prev = sessionStorage.getItem("cart-referrer");
      if (prev) {
        sessionStorage.removeItem("cart-referrer");
        router.push(prev);
      } else {
        router.push("/categories");
      }
    } catch {
      router.push("/categories");
    }
  };
  const [unavailableIds, setUnavailableIds] = useState<Set<number>>(new Set());
  const [stockLimits, setStockLimits] = useState<Record<number, number>>({});
  const [checking, setChecking] = useState(true);

  // On load, check each cart item's availability against backend
  useEffect(() => {
    if (cart.length === 0) { setChecking(false); return; }
    const checkAvailability = async () => {
      const unavailable = new Set<number>();
      const limits: Record<number, number> = {};
      await Promise.all(cart.map(async (item) => {
        try {
          const res = await fetch(`${API_URL}/api/services/listings/${item.id}/`);
          if (res.ok) {
            const data = await res.json();
            if (!data.is_available || (data.track_inventory && data.stock_quantity === 0)) {
              unavailable.add(item.id);
            }
            // Store stock limit for tracked items
            if (data.track_inventory && data.stock_quantity > 0) {
              limits[item.id] = data.stock_quantity;
            }
          } else {
            unavailable.add(item.id);
          }
        } catch {}
      }));
      setUnavailableIds(unavailable);
      setStockLimits(limits);
      // Clamp any cart quantities that exceed stock
      Object.entries(limits).forEach(([idStr, max]) => {
        const id = Number(idStr);
        const item = cart.find(i => i.id === id);
        if (item && item.quantity > max) updateQuantity(id, max);
      });
      setChecking(false);
    };
    checkAvailability();
  }, [cart.length]);

  const availableItems = cart.filter(item => !unavailableIds.has(item.id));
  const total = availableItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const hasUnavailable = unavailableIds.size > 0;

  if (cart.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-purple-50 via-white to-teal-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 flex flex-col items-center justify-center px-8 pt-20 pb-32">
        <motion.div initial={{ scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }} className="relative">
          <div className="absolute inset-0 blur-3xl">
            <div className="w-64 h-64 bg-gradient-to-r from-purple-400 to-teal-400 rounded-full opacity-40 animate-pulse" />
          </div>
          <motion.div initial={{ y: 20 }} animate={{ y: [0, -20, 0] }}
            transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
            className="relative z-10 bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-3xl p-12 shadow-2xl border border-purple-100 dark:border-gray-700">
            <ShoppingBag className="w-28 h-28 mx-auto text-purple-600 dark:text-purple-400" strokeWidth={1.5} />
          </motion.div>
          {[...Array(6)].map((_, i) => (
            <motion.div key={i} initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: [0.3, 1, 0.3], scale: [0, 1.5, 0],
                x: Math.cos(i * 60 * Math.PI / 180) * 80,
                y: Math.sin(i * 60 * Math.PI / 180) * 80 }}
              transition={{ duration: 3, repeat: Infinity, delay: i * 0.3, ease: "easeOut" }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
              <Sparkles className="w-8 h-8 text-purple-500" />
            </motion.div>
          ))}
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }} className="text-center mt-12">
          <h2 className="text-4xl font-black bg-gradient-to-r from-purple-600 to-teal-600 bg-clip-text text-transparent mb-3">
            Your cart is empty
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">Time to add some glow to your life</p>
          <Link href="/categories">
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              className="px-10 py-5 bg-gradient-to-r from-purple-600 to-teal-600 text-white font-black text-xl rounded-full shadow-2xl flex items-center gap-3 mx-auto">
              Browse Categories <ArrowRight className="w-6 h-6" />
            </motion.button>
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <>
      <div className="sticky top-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl z-50 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between p-5">
          <button onClick={handleBack}
            className="p-3 rounded-full bg-purple-100 dark:bg-purple-900/30 hover:bg-purple-200 transition-all active:scale-95">
            <svg className="w-6 h-6 text-gray-900 dark:text-gray-100" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-black text-gray-900 dark:text-white">Cart ({cart.length})</h1>
          <button onClick={clearCart} className="text-red-500 dark:text-red-400 font-bold text-sm">Clear All</button>
        </div>
      </div>

      <div className="p-5 pb-32 space-y-5 bg-[#FFF8F0] dark:bg-gray-950 min-h-screen">

        {/* Unavailability warning banner */}
        {!checking && hasUnavailable && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-2xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-orange-800 dark:text-orange-300 text-sm">Some items are unavailable</p>
              <p className="text-orange-700 dark:text-orange-400 text-xs mt-0.5">
                {unavailableIds.size} item{unavailableIds.size > 1 ? 's' : ''} in your cart {unavailableIds.size > 1 ? 'are' : 'is'} no longer available.
                Remove {unavailableIds.size > 1 ? 'them' : 'it'} to proceed to checkout.
              </p>
            </div>
          </motion.div>
        )}

        {cart.map((item, i) => {
          const isUnavailable = unavailableIds.has(item.id);
          return (
            <motion.div key={item.id} initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className={`bg-white dark:bg-gray-800 rounded-3xl p-5 shadow-lg border flex gap-4 relative overflow-hidden ${
                isUnavailable
                  ? 'border-red-200 dark:border-red-800 opacity-75'
                  : 'border-purple-100 dark:border-gray-700'
              }`}>

              {/* Unavailable overlay label */}
              {isUnavailable && (
                <div className="absolute top-3 right-3 bg-red-500 text-white text-xs font-black px-2 py-1 rounded-full flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Unavailable
                </div>
              )}

              <div className={`relative w-24 h-24 rounded-2xl overflow-hidden ring-2 ${isUnavailable ? 'ring-red-200 grayscale' : 'ring-purple-100 dark:ring-purple-900/50'}`}>
                <Image
                  src={item.img?.startsWith("http") ? item.img : item.img?.startsWith("/") ? item.img : `/images/${item.img}`}
                  alt={item.title} fill className="object-cover" />
              </div>

              <div className="flex-1">
                <h3 className="font-black text-lg text-gray-900 dark:text-white">{item.title}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">₦{item.price.toLocaleString()} each</p>
                {isUnavailable ? (
                  <p className="text-red-500 text-xs font-bold mt-1">This item is sold out or no longer available</p>
                ) : (
                  <>
                    <p className="text-2xl font-black text-purple-600 dark:text-purple-400 mt-1">
                      ₦{(item.price * item.quantity).toLocaleString()}
                    </p>
                    {stockLimits[item.id] && (
                      <p className="text-xs text-orange-500 font-semibold mt-0.5">
                        Max: {stockLimits[item.id]} available
                        {item.quantity >= stockLimits[item.id] && " · Limit reached"}
                      </p>
                    )}
                  </>
                )}
              </div>

              <div className="flex flex-col justify-between items-end gap-4">
                {!isUnavailable && (
                  <div className="flex items-center gap-3 bg-purple-50 dark:bg-purple-900/30 rounded-full px-4 py-2">
                    <button onClick={() => updateQuantity(item.id, Math.max(1, item.quantity - 1))}>
                      <Minus className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                    </button>
                    <span className="font-black text-purple-700 dark:text-purple-300 w-8 text-center">{item.quantity}</span>
                    <button onClick={() => {
                      const max = stockLimits[item.id];
                      if (max && item.quantity >= max) return;
                      updateQuantity(item.id, item.quantity + 1);
                    }}>
                      <Plus className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                    </button>
                  </div>
                )}
                <button onClick={() => removeFromCart(item.id)} className="text-red-500 dark:text-red-400">
                  <Trash2 className="w-6 h-6" />
                </button>
              </div>
            </motion.div>
          );
        })}

        {/* Total & Checkout — only show if there are available items */}
        {availableItems.length > 0 && (
          <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="bg-gradient-to-r from-purple-600 to-teal-600 rounded-3xl p-6 text-white shadow-2xl">
            <div className="flex justify-between items-center mb-2">
              <p className="text-2xl font-black">Total</p>
              <p className="text-4xl font-black">₦{total.toLocaleString()}</p>
            </div>
            {hasUnavailable && (
              <p className="text-white/70 text-xs mb-4">Unavailable items excluded from total</p>
            )}
            <Link href={hasUnavailable ? "#" : "/checkout"}
              onClick={e => { if (hasUnavailable) { e.preventDefault(); } }}>
              <motion.button whileHover={{ scale: hasUnavailable ? 1 : 1.02 }} whileTap={{ scale: 0.98 }}
                disabled={hasUnavailable}
                className={`w-full py-5 font-black text-xl rounded-3xl shadow-xl flex items-center justify-center gap-3 transition ${
                  hasUnavailable
                    ? 'bg-white/40 text-white/60 cursor-not-allowed'
                    : 'bg-white text-purple-600'
                }`}>
                {hasUnavailable ? 'Remove unavailable items first' : <>Checkout Now <ArrowRight className="w-6 h-6" /></>}
              </motion.button>
            </Link>
          </motion.div>
        )}
      </div>
    </>
  );
}
