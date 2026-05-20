"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { X, Star, Trophy, ShoppingBag } from "lucide-react";
import { GRAD } from "@/lib/tokens";

interface VendorOfMonth {
  id: number;
  username: string;
  business_name: string;
  profile_picture: string | null;
  rating: number;
  total_reviews: number;
  vendor_badge: string;
  month: string;
  total_orders: number;
  completion_rate: number;
}

const STORAGE_KEY_PREFIX = "votm_seen_";

function getThisMonthKey() {
  const now = new Date();
  return `${STORAGE_KEY_PREFIX}${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function VendorOfMonthModal({ vendor }: { vendor: VendorOfMonth | null }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!vendor) return;
    const key = getThisMonthKey();
    if (!localStorage.getItem(key)) {
      // Slight delay so page loads first
      const t = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(t);
    }
  }, [vendor]);

  const dismiss = () => {
    localStorage.setItem(getThisMonthKey(), "1");
    setVisible(false);
  };

  if (!vendor) return null;

  const hasPic = !!vendor.profile_picture;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
          onClick={dismiss}
        >
          <motion.div
            initial={{ y: 80, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 60, opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl"
            style={{ fontFamily: "'DM Sans', sans-serif" }}
          >
            {/* Hero image or gradient */}
            <div className="relative h-72 sm:h-64 w-full">
              {hasPic ? (
                <img
                  src={vendor.profile_picture!}
                  alt={vendor.business_name}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <div className="absolute inset-0" style={{ background: GRAD }} />
              )}
              {/* Gradient overlay for text readability */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

              {/* Close button */}
              <button
                onClick={dismiss}
                className="absolute top-4 right-4 w-9 h-9 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-black/60 transition z-10"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Trophy badge */}
              <div className="absolute top-4 left-4 flex items-center gap-2 bg-amber-400 text-amber-900 px-3 py-1.5 rounded-full text-xs font-bold shadow-lg">
                <Trophy className="w-3.5 h-3.5" />
                Vendor of the Month
              </div>

              {/* Name & month */}
              <div className="absolute bottom-0 left-0 right-0 px-5 pb-4">
                <p className="text-white/70 text-xs font-semibold tracking-widest uppercase mb-1">{vendor.month}</p>
                <h2 className="text-white text-2xl font-black leading-tight">{vendor.business_name}</h2>
                <p className="text-white/60 text-sm">@{vendor.username}</p>
              </div>
            </div>

            {/* Stats + CTA */}
            <div className="bg-white px-5 pt-4 pb-6 space-y-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-stone-50 rounded-2xl p-3">
                  <p className="text-lg font-black text-stone-900">{vendor.total_orders}</p>
                  <p className="text-[10px] text-stone-400 font-medium mt-0.5">Orders</p>
                </div>
                <div className="bg-stone-50 rounded-2xl p-3">
                  <div className="flex items-center justify-center gap-1">
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    <p className="text-lg font-black text-stone-900">{vendor.rating.toFixed(1)}</p>
                  </div>
                  <p className="text-[10px] text-stone-400 font-medium mt-0.5">Rating</p>
                </div>
                <div className="bg-stone-50 rounded-2xl p-3">
                  <p className="text-lg font-black text-stone-900">{Math.round(vendor.completion_rate)}%</p>
                  <p className="text-[10px] text-stone-400 font-medium mt-0.5">Completion</p>
                </div>
              </div>

              <Link href={`/vendor/${vendor.username}`} onClick={dismiss}>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  className="w-full py-3.5 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg"
                  style={{ background: GRAD }}
                >
                  <ShoppingBag className="w-4 h-4" />
                  Shop {vendor.business_name}
                </motion.button>
              </Link>

              <button
                onClick={dismiss}
                className="w-full text-center text-stone-400 text-xs py-1"
              >
                Maybe later
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
