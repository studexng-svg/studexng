// src/app/deals/page.tsx
"use client";

import { Zap, Plus, Heart } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCartStore } from "@/lib/cartStore";
import { useWishlistStore } from "@/lib/wishlistStore";

const allDeals = [
  { id: 1, title: "Jollof Rice + Chicken", old: 1800, new: 1200, img: "deal-food-1.jpg", time: "15 mins" },
  { id: 2, title: "Shawarma Wrap", old: 1500, new: 1000, img: "deal-food-2.jpg", time: "12 mins" },
  { id: 3, title: "Indomie + Egg", old: 800, new: 500, img: "deal-food-3.jpg", time: "10 mins" },
  { id: 4, title: "Suya + Bread", old: 2200, new: 1600, img: "deal-food-4.jpg", time: "18 mins" },
  { id: 5, title: "Burger + Coke", old: 2500, new: 1800, img: "deal-food-5.jpg", time: "20 mins" },
  { id: 6, title: "Pounded Yam + Egusi", old: 3000, new: 2200, img: "deal-food-6.jpg", time: "25 mins" },
  { id: 7, title: "Fried Rice + Salad", old: 1900, new: 1300, img: "deal-food-7.jpg", time: "15 mins" },
];

const getTimeLeft = () => {
  const now = new Date();
  const end = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const diff = end.getTime() - now.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  return { hours, minutes, seconds };
};

export default function DealsPage() {
  const router = useRouter();
  const addToCart = useCartStore((state) => state.addToCart);
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlistStore();

  const [timeLeft, setTimeLeft] = useState(getTimeLeft());
  const [toast, setToast] = useState("");

  useEffect(() => {
    const timer = setInterval(() => setTimeLeft(getTimeLeft()), 1000);
    return () => clearInterval(timer);
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
  };

  return (
    <>
      {/* TOAST — GREEN OR RED */}
      {toast && (
        <motion.div
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 60, opacity: 1 }}
          className={`fixed top-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full shadow-lg z-50 font-medium text-sm text-white ${
            toast.includes("Wishlist") ? "bg-red-500" : "bg-green-500"
          }`}
        >
          {toast}
        </motion.div>
      )}

      {/* URGENCY BANNER */}
      <motion.div
        initial={{ y: -50 }}
        animate={{ y: 0 }}
        className="bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold text-center py-2.5 px-4 shadow-md sticky top-0 z-40"
      >
        <div className="flex items-center justify-center gap-2 text-sm">
          <Zap className="w-4 h-4 animate-pulse" />
          <span>
            LIMITED: {timeLeft.hours}h {timeLeft.minutes}m {timeLeft.seconds}s LEFT —{" "}
            <span className="underline">GRAB NOW!</span>
          </span>
          <Zap className="w-4 h-4 animate-pulse" />
        </div>
      </motion.div>

      {/* TOP BAR */}
      <div className="sticky top-11 bg-white z-40 border-b">
        <div className="flex items-center justify-between p-4">
          <button onClick={() => router.back()} className="text-black">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-bold text-black">Flash Deals</h1>
          <div />
        </div>
      </div>

      {/* DEALS GRID */}
      <div className="p-4 pb-24">
        <div className="grid grid-cols-2 gap-4">
          {allDeals.map((deal, i) => (
            <motion.div
              key={deal.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
            >
              <Link href={`/deals/${deal.id}`}>
                <motion.div
                  whileHover={{ y: -3 }}
                  className="bg-surface rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 border border-transparent hover:border-amber-300 relative pb-8"
                >
                  {/* IMAGE */}
                  <div className="relative h-44">
                    <Image
                      src={`/images/${deal.img}`}
                      alt={deal.title}
                      fill
                      className="object-cover hover:scale-105 transition-transform duration-300"
                    />
                  </div>

                  {/* + BUTTON (TOP RIGHT) */}
                  <motion.button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      addToCart({ id: deal.id, title: deal.title, price: deal.new, img: deal.img });
                      showToast("Added to Cart!");
                    }}
                    whileHover={{ scale: 1.2 }}
                    whileTap={{ scale: 0.9 }}
                    className="absolute top-2 right-2 p-1.5 bg-white rounded-full shadow"
                  >
                    <Plus className="w-4 h-4 text-primary" />
                  </motion.button>

                  {/* LIKE BUTTON (BOTTOM RIGHT) */}
                  <motion.button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const item = { id: deal.id, title: deal.title, price: deal.new, img: deal.img };
                      if (isInWishlist(deal.id)) {
                        removeFromWishlist(deal.id);
                        showToast("Removed from Wishlist!");
                      } else {
                        addToWishlist(item);
                        showToast("Added to Wishlist!");
                      }
                    }}
                    whileHover={{ scale: 1.2 }}
                    whileTap={{ scale: 0.9 }}
                    className="absolute bottom-2 right-2 p-1.5 bg-white rounded-full shadow"
                  >
                    <Heart
                      className={`w-4 h-4 transition-all ${
                        isInWishlist(deal.id) ? "fill-red-500 text-red-500" : "text-gray-400"
                      }`}
                    />
                  </motion.button>

                  {/* TIME BADGE */}
                  <div className="absolute bottom-1 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full">
                    {deal.time}
                  </div>

                  {/* TEXT */}
                  <div className="p-3 space-y-1">
                    <p className="font-medium text-black text-sm line-clamp-2">{deal.title}</p>
                    <p className="text-xs text-black/60 line-through">₦{deal.old.toLocaleString()}</p>
                    <p className="text-lg font-bold text-red-500">₦{deal.new.toLocaleString()}</p>
                  </div>
                </motion.div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>

      {/* BOTTOM NAV */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t z-50 shadow-lg">
        <div className="flex justify-around py-2">
          <Link href="/" className="text-black/60"><span className="text-xs">Home</span></Link>
          <Link href="/categories" className="text-black/60"><span className="text-xs">Categories</span></Link>
          <Link href="/cart" className="text-black/60"><span className="text-xs">Cart</span></Link>
          <Link href="/wishlist" className="text-primary font-bold"><span className="text-xs">Wishlist</span></Link>
          <Link href="/account" className="text-black/60"><span className="text-xs">Account</span></Link>
        </div>
      </div>
    </>
  );
}