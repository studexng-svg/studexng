"use client";

import { Heart, Package } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/authStore";
import { useCartStore } from "@/lib/cartStore";
import { useWishlistStore } from "@/lib/wishlistStore"; // ✅ NEW
import { useState } from "react";

export default function WishlistPage() {
  const { isLoggedIn } = useAuth();
  const addToCart = useCartStore((state) => state.addToCart);

  // ✅ Zustand wishlist (NO backend anymore)
  const wishlist = useWishlistStore((state) => state.wishlist);
  const removeFromWishlist = useWishlistStore((state) => state.removeFromWishlist);

  const [toast, setToast] = useState("");

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
  };

  const clearWishlist = () => {
    wishlist.forEach((item) => removeFromWishlist(item.id));
    showToast("Wishlist cleared");
  };

  const handleAddToCart = (item: any) => {
    addToCart({
      id: item.id,
      title: item.title,
      price: item.price,
      img: item.img,
    });

    removeFromWishlist(item.id);
    showToast("Added to Cart!");
  };

  // Not logged in
  if (!isLoggedIn) {
    return (
      <div className="p-8 text-center mt-20 bg-[#FFF8F0] dark:bg-gray-950 min-h-screen">
        <Heart className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
        <p className="text-black/70 dark:text-gray-300 text-lg">
          Please login to view your wishlist
        </p>
        <Link href="/auth">
          <button className="mt-4 px-6 py-2 bg-purple-600 dark:bg-purple-700 text-white rounded-full font-medium hover:bg-purple-700 dark:hover:bg-purple-600">
            Login
          </button>
        </Link>
      </div>
    );
  }

  // Empty wishlist
  if (wishlist.length === 0) {
    return (
      <div className="p-8 text-center mt-20 bg-[#FFF8F0] dark:bg-gray-950 min-h-screen">
        <Heart className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
        <p className="text-black/70 dark:text-gray-300 text-lg">
          Your wishlist is empty
        </p>
        <Link href="/deals">
          <button className="mt-4 text-purple-600 dark:text-purple-400 font-medium underline">
            Browse Deals
          </button>
        </Link>
      </div>
    );
  }

  return (
    <>
      {/* TOAST */}
      {toast && (
        <motion.div
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 60, opacity: 1 }}
          exit={{ y: -50, opacity: 0 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full shadow-lg z-50 font-medium text-sm text-white bg-green-500"
        >
          {toast}
        </motion.div>
      )}

      {/* TOP BAR */}
      <div className="sticky top-0 bg-white dark:bg-gray-900 z-40 border-b border-gray-200 dark:border-gray-800 shadow-sm">
        <div className="flex items-center justify-between p-4">
          <Link href="/" className="text-black dark:text-white">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-xl font-bold text-black dark:text-white">
            Wishlist ({wishlist.length})
          </h1>
          <button
            onClick={clearWishlist}
            className="text-red-500 dark:text-red-400 text-sm font-medium"
          >
            Clear
          </button>
        </div>
      </div>

      {/* WISHLIST ITEMS */}
      <div className="p-4 pb-32 space-y-4 bg-[#FFF8F0] dark:bg-gray-950 min-h-screen">
        {wishlist.map((item, index) => (
          <motion.div
            key={`${item.id}-${index}`}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
            className="bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-700"
          >
            <Link href={`/deals/${item.id}`}>
              <div className="flex gap-3 p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                <div className="relative w-20 h-20 rounded-lg overflow-hidden flex-shrink-0">
                  <img
                    src={item.img?.startsWith("http") || item.img?.startsWith("/images/") ? item.img : `/images/${item.img}`}
                    alt={item.title}
                    className="object-cover w-full h-full"
                  />
                </div>

                <div className="flex-1">
                  <p className="font-medium text-black dark:text-white line-clamp-2">
                    {item.title}
                  </p>
                  <p className="text-lg font-bold text-red-500 dark:text-red-400">
                    ₦{item.price?.toLocaleString()}
                  </p>
                </div>
              </div>
            </Link>

            <div className="flex justify-between items-center px-4 pb-3">
              <button
                onClick={() => handleAddToCart(item)}
                className="bg-purple-600 dark:bg-purple-700 text-white px-5 py-2 rounded-full text-sm font-bold flex items-center gap-1.5 shadow hover:shadow-md hover:bg-purple-700 dark:hover:bg-purple-600 transition-all"
              >
                <Package className="w-4 h-4" />
                Add to Cart
              </button>

              <button
                onClick={() => {
                  removeFromWishlist(item.id);
                  showToast("Removed from Wishlist");
                }}
                className="p-2 text-red-500 dark:text-red-400"
              >
                <Heart className="w-5 h-5 fill-red-500 dark:fill-red-400" />
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {/* BOTTOM NAV */}
      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 z-50 shadow-lg">
        <div className="flex justify-around py-2">
          <Link href="/" className="text-black/60 dark:text-gray-400"><span className="text-xs">Home</span></Link>
          <Link href="/categories" className="text-black/60 dark:text-gray-400"><span className="text-xs">Categories</span></Link>
          <Link href="/cart" className="text-black/60 dark:text-gray-400"><span className="text-xs">Cart</span></Link>
          <Link href="/wishlist" className="text-purple-600 dark:text-purple-400 font-bold"><span className="text-xs">Wishlist</span></Link>
          <Link href="/account" className="text-black/60 dark:text-gray-400"><span className="text-xs">Account</span></Link>
        </div>
      </div>
    </>
  );
}