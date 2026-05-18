// src/app/deals/[id]/page.tsx
"use client";

import { Package, Plus, Heart } from "lucide-react";
import Image from "next/image";
import { motion } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
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

export default function DealDetail() {
  const router = useRouter();
  const { id } = useParams();
  const dealId = parseInt(id as string);
  const deal = allDeals.find(d => d.id === dealId);

  const addToCart = useCartStore((state) => state.addToCart);
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlistStore();

  const [toast, setToast] = useState("");

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
  };

  if (!deal) {
    return (
      <div className="p-8 text-center">
        <p className="text-black">Deal not found</p>
        <button onClick={() => router.push("/deals")} className="text-primary text-sm mt-2">
          Back to Deals
        </button>
      </div>
    );
  }

  const isLiked = isInWishlist(deal.id);

  return (
    <>
      {/* TOAST — GREEN OR RED */}
      {toast && (
        <motion.div
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 60, opacity: 1 }}
          className={`fixed-fixed top-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full shadow-lg z-50 font-medium text-sm text-white ${
            toast.includes("Wishlist") ? "bg-red-500" : "bg-green-500"
          }`}
        >
          {toast}
        </motion.div>
      )}

      {/* TOP BAR */}
      <div className="sticky top-0 bg-white z-40 border-b shadow-sm">
        <div className="flex items-center justify-between p-4">
          <button onClick={() => router.back()} className="text-black">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-bold text-black">Deal</h1>
          <div />
        </div>
      </div>

      <div className="p-4 pb-24">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-surface rounded-2xl overflow-hidden shadow-lg"
        >
          {/* IMAGE + LIKE BUTTON */}
          <div className="relative h-64">
            <Image
              src={`/images/${deal.img}`}
              alt={deal.title}
              fill
              className="object-cover"
            />
            {/* LIKE BUTTON (TOP RIGHT) */}
            <motion.button
              onClick={() => {
                const item = { id: deal.id, title: deal.title, price: deal.new, img: deal.img };
                if (isLiked) {
                  removeFromWishlist(deal.id);
                  showToast("Removed from Wishlist!");
                } else {
                  addToWishlist(item);
                  showToast("Added to Wishlist!");
                }
              }}
              whileHover={{ scale: 1.2 }}
              whileTap={{ scale: 0.9 }}
              className="absolute top-4 right-4 p-2 bg-white rounded-full shadow"
            >
              <Heart
                className={`w-5 h-5 transition-all ${
                  isLiked ? "fill-red-500 text-red-500" : "text-gray-400"
                }`}
              />
            </motion.button>
          </div>

          {/* CONTENT */}
          <div className="p-5 space-y-3">
            <h2 className="text-xl font-bold text-black">{deal.title}</h2>
            <p className="text-black/80">Spicy and delicious campus favorite. Ready in minutes!</p>

            <div className="flex items-center gap-2 text-sm">
              <Package className="w-4 h-4 text-primary" />
              <span className="text-black">Delivery in {deal.time}</span>
            </div>

            <div className="flex justify-between items-center">
              <div>
                <p className="text-xs text-black/60 line-through">₦{deal.old.toLocaleString()}</p>
                <p className="text-2xl font-bold text-red-500">₦{deal.new.toLocaleString()}</p>
              </div>

              {/* + BUTTON → ADD TO CART */}
              <motion.button
                onClick={() => {
                  addToCart({ id: deal.id, title: deal.title, price: deal.new, img: deal.img });
                  showToast("Added to Cart!");
                }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="bg-primary text-white px-8 py-3 rounded-full font-bold shadow-lg hover:shadow-xl transition-shadow flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Add to Cart
              </motion.button>
            </div>
          </div>
        </motion.div>
      </div>
    </>
  );
}