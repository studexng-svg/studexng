// src/app/cart/page.tsx
"use client";

import { Plus, Minus, Trash2, ShoppingBag, ArrowRight, Sparkles, AlertCircle, Clock } from "lucide-react";
import TopNav from "@/components/layout/TopNav";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCartStore } from "@/lib/cartStore";
import { useAuth, fetchWithAuth } from "@/lib/authStore";
import { useEffect, useState, useMemo } from "react";
import { GRAD, GRAD_TEXT, SERIF } from "@/lib/tokens";

function CountdownTimer({ reservedAt }: { reservedAt: string }) {
  const expiresAt = useMemo(() => new Date(reservedAt).getTime() + 10 * 60 * 1000, [reservedAt]);
  const [remaining, setRemaining] = useState(() => Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)));

  useEffect(() => {
    if (remaining <= 0) return;
    const interval = setInterval(() => {
      setRemaining(Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  if (remaining <= 0) {
    return (
      <p className="text-red-500 text-xs font-medium flex items-center gap-1 mt-1">
        <Clock className="w-3 h-3" /> Reservation expired
      </p>
    );
  }

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const isUrgent = remaining < 120;

  return (
    <p className={`text-xs font-medium flex items-center gap-1 mt-1 ${isUrgent ? "text-red-500 animate-pulse" : "text-amber-500"}`}>
      <Clock className="w-3 h-3" /> Reserved for {mins}:{String(secs).padStart(2, "0")}
    </p>
  );
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export default function CartPage() {
  const router = useRouter();
  const { cart, removeFromCart, updateQuantity, clearCart } = useCartStore();
  const { isLoggedIn } = useAuth();

  const handleBack = () => {
    try {
      const prev = sessionStorage.getItem("cart-referrer");
      if (prev) { sessionStorage.removeItem("cart-referrer"); router.push(prev); }
      else router.push("/categories");
    } catch { router.push("/categories"); }
  };

  const [unavailableIds, setUnavailableIds] = useState<Set<number>>(new Set());
  const [stockLimits, setStockLimits] = useState<Record<number, number>>({});
  const [reservedAt, setReservedAt] = useState<Record<number, string>>({});
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (cart.length === 0) { setChecking(false); return; }
    const checkAvailability = async () => {
      const unavailable = new Set<number>();
      const limits: Record<number, number> = {};
      await Promise.all(cart.map(async item => {
        try {
          const res = await fetch(`${API_URL}/api/services/listings/${item.id}/`);
          if (res.ok) {
            const data = await res.json();
            if (!data.is_available || (data.track_inventory && data.stock_quantity === 0)) unavailable.add(item.id);
            if (data.track_inventory && data.stock_quantity > 0) limits[item.id] = data.stock_quantity;
          } else { unavailable.add(item.id); }
        } catch {}
      }));
      setUnavailableIds(unavailable);
      setStockLimits(limits);
      Object.entries(limits).forEach(([idStr, max]) => {
        const id = Number(idStr);
        const item = cart.find(i => i.id === id);
        if (item && item.quantity > max) updateQuantity(id, max);
      });

      // Fetch reserved_at times for countdown timers
      if (isLoggedIn) {
        try {
          const cartRes = await fetchWithAuth(`${API_URL}/api/cart/`);
          if (cartRes.ok) {
            const cartData: Array<{ listing_id: number; reserved_at: string | null }> = await cartRes.json();
            const reservations: Record<number, string> = {};
            cartData.forEach(i => { if (i.reserved_at) reservations[i.listing_id] = i.reserved_at; });
            setReservedAt(reservations);
          }
        } catch {}
      }

      setChecking(false);
    };
    checkAvailability();
  }, [cart.length, isLoggedIn]);

  const availableItems = cart.filter(item => !unavailableIds.has(item.id));
  const total = availableItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const hasUnavailable = unavailableIds.size > 0;

  // ── EMPTY STATE ──────────────────────────────────────────────────────────
  if (cart.length === 0) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex flex-col items-center justify-center px-6 pb-28" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <div className="text-center animate-fadeUp">
          <div className="w-24 h-24 mx-auto mb-6 rounded-2xl flex items-center justify-center"
            style={{ background: GRAD }}>
            <ShoppingBag className="w-12 h-12 text-white" strokeWidth={1.5} />
          </div>
          <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-semibold mb-2">Empty Cart</p>
          <h2 className="text-2xl font-bold text-stone-900 mb-2" style={SERIF}>
            Your cart is empty
          </h2>
          <p className="text-stone-400 text-sm mb-8">Add something from our services to get started.</p>
          <Link href="/categories">
            <button
              className="px-8 py-3 text-white font-semibold rounded-full shadow-lg shadow-teal-200/60 inline-flex items-center gap-2 text-sm hover-scale tap-scale"
              style={{ background: GRAD }}>
              Browse Categories <ArrowRight className="w-4 h-4" />
            </button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>

      <TopNav showBack activeNav="services" />

      <div className="px-4 pt-6 pb-28 space-y-4 max-w-2xl mx-auto">

        {/* ── SECTION HEADER ── */}
        <div className="flex items-center justify-between animate-fadeUp">
          <div>
            <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-semibold">Your Order</p>
            <h2 className="text-xl font-bold text-stone-900 mt-0.5" style={SERIF}>
              Cart ({cart.length})
            </h2>
          </div>
          <button onClick={clearCart}
            className="text-red-400 hover:text-red-600 font-medium text-sm transition-colors">
            Clear All
          </button>
        </div>

        {/* ── UNAVAILABILITY WARNING ── */}
        {!checking && hasUnavailable && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 animate-fadeUp">
            <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-800 text-sm">Some items are unavailable</p>
              <p className="text-amber-600 text-xs mt-0.5">
                {unavailableIds.size} item{unavailableIds.size > 1 ? "s" : ""} in your cart {unavailableIds.size > 1 ? "are" : "is"} no longer available.
                Remove {unavailableIds.size > 1 ? "them" : "it"} to proceed to checkout.
              </p>
            </div>
          </div>
        )}

        {/* ── CART ITEMS ── */}
        {cart.map((item, i) => {
          const isUnavailable = unavailableIds.has(item.id);
          return (
            <div
              key={item.id}
              className={`bg-white rounded-2xl p-4 shadow-sm border flex gap-4 relative overflow-hidden transition-all animate-fadeUp ${
                isUnavailable ? "border-red-200 opacity-70" : "border-stone-200 hover:border-teal-300 hover:shadow-md"
              }`}>

              {/* Unavailable badge */}
              {isUnavailable && (
                <div className="absolute top-3 right-3 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Unavailable
                </div>
              )}

              {/* Image */}
              <div className={`relative w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 ${isUnavailable ? "grayscale" : ""}`}>
                {item.img?.startsWith("http") || item.img?.startsWith("/") ? (
                  <Image
                    src={item.img.startsWith("http") ? item.img : item.img.startsWith("/") ? item.img : `/images/${item.img}`}
                    alt={item.title} fill className="object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-teal-50 to-purple-50 flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-stone-300" />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-stone-900 text-sm leading-tight truncate">{item.title}</h3>
                <p className="text-xs text-stone-400 mt-0.5">₦{item.price.toLocaleString()} each</p>

                {isUnavailable ? (
                  <p className="text-red-500 text-xs font-medium mt-1">No longer available</p>
                ) : (
                  <>
                    <p className="text-lg font-bold mt-1" style={GRAD_TEXT}>
                      ₦{(item.price * item.quantity).toLocaleString()}
                    </p>
                    {stockLimits[item.id] && (
                      <p className="text-xs text-amber-500 font-medium mt-0.5">
                        Max {stockLimits[item.id]} available
                        {item.quantity >= stockLimits[item.id] && " · Limit reached"}
                      </p>
                    )}
                    {reservedAt[item.id] && <CountdownTimer reservedAt={reservedAt[item.id]} />}
                  </>
                )}
              </div>

              {/* Controls */}
              <div className="flex flex-col justify-between items-end gap-3 flex-shrink-0">
                {!isUnavailable && (
                  <div className="flex items-center gap-2 bg-stone-100 rounded-full px-3 py-1.5">
                    <button onClick={() => updateQuantity(item.id, Math.max(1, item.quantity - 1))}
                      className="text-stone-500 hover:text-teal-600 transition">
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="font-bold text-stone-700 w-5 text-center text-sm">{item.quantity}</span>
                    <button onClick={() => {
                      const max = stockLimits[item.id];
                      if (max && item.quantity >= max) return;
                      updateQuantity(item.id, item.quantity + 1);
                    }} className="text-stone-500 hover:text-teal-600 transition">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                )}
                <button onClick={() => removeFromCart(item.id)}
                  className="text-stone-300 hover:text-red-400 transition">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          );
        })}

        {/* ── ORDER SUMMARY + CHECKOUT ── */}
        {availableItems.length > 0 && (
          <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm space-y-4 animate-fadeUp">

            {/* Summary */}
            <div>
              <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-semibold mb-3">Order Summary</p>
              <div className="space-y-2">
                {availableItems.map(item => (
                  <div key={item.id} className="flex justify-between items-center text-sm">
                    <span className="text-stone-500 truncate max-w-[60%]">{item.title} × {item.quantity}</span>
                    <span className="text-stone-700 font-medium">₦{(item.price * item.quantity).toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-stone-100 mt-3 pt-3 flex justify-between items-center">
                <span className="font-bold text-stone-900" style={SERIF}>Total</span>
                <span className="text-2xl font-bold" style={GRAD_TEXT}>₦{total.toLocaleString()}</span>
              </div>
              {hasUnavailable && (
                <p className="text-amber-500 text-xs mt-1">Unavailable items excluded from total</p>
              )}
            </div>

            {/* Checkout button */}
            <Link href={hasUnavailable ? "#" : "/checkout"}
              onClick={e => { if (hasUnavailable) e.preventDefault(); }}>
              <button
                disabled={hasUnavailable}
                className={`w-full py-4 font-semibold text-sm rounded-full flex items-center justify-center gap-2 transition-all tap-scale ${
                  hasUnavailable
                    ? "bg-stone-100 text-stone-400 cursor-not-allowed"
                    : "text-white shadow-lg shadow-teal-200/60"
                }`}
                style={hasUnavailable ? {} : { background: GRAD }}>
                {hasUnavailable
                  ? "Remove unavailable items first"
                  : <> Checkout Now <ArrowRight className="w-4 h-4" /></>
                }
              </button>
            </Link>
          </div>
        )}

      </div>
    </div>
  );
}