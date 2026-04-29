"use client";

import { Heart, Package, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/lib/authStore";
import { useCartStore } from "@/lib/cartStore";
import { useWishlistStore } from "@/lib/wishlistStore";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { GRAD, GRAD_TEXT, SERIF } from "@/lib/tokens";

export default function WishlistPage() {
  const router = useRouter();
  const { isLoggedIn } = useAuth();
  const addToCart = useCartStore((state) => state.addToCart);

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
      <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center p-6" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <div className="text-center">
          <Heart className="w-16 h-16 text-stone-300 mx-auto mb-4" />
          <p className="text-stone-500 text-lg mb-5">Please login to view your wishlist</p>
          <Link href="/auth">
            <button
              className="px-6 py-3 text-white font-medium rounded-full shadow-lg text-sm"
              style={{ background: GRAD }}>
              Login
            </button>
          </Link>
        </div>
      </div>
    );
  }

  // Empty wishlist
  if (wishlist.length === 0) {
    return (
      <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center p-6" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <div className="text-center">
          <Heart className="w-16 h-16 text-stone-300 mx-auto mb-4" />
          <p className="text-stone-500 text-lg mb-5">Your wishlist is empty</p>
          <Link href="/categories">
            <button
              className="px-6 py-3 text-white font-medium rounded-full shadow-lg text-sm"
              style={{ background: GRAD }}>
              Browse Categories
            </button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF9]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* TOAST */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full shadow-lg z-50 font-medium text-sm text-white bg-teal-600 animate-fadeIn">
          {toast}
        </div>
      )}

      {/* STICKY HEADER */}
      <div className="sticky top-0 bg-white/80 backdrop-blur-md z-40 border-b border-stone-100 shadow-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => router.back()}
            className="p-2.5 bg-white border border-stone-200 hover:border-stone-300 rounded-full shadow-sm transition-all active:scale-95">
            <ChevronLeft className="w-5 h-5 text-stone-600" />
          </button>
          <h1 className="text-base font-bold text-stone-900" style={SERIF}>
            Wishlist ({wishlist.length})
          </h1>
          <button
            onClick={clearWishlist}
            className="text-red-500 text-sm font-medium">
            Clear
          </button>
        </div>
      </div>

      {/* WISHLIST ITEMS */}
      <div className="px-4 pt-4 pb-32 space-y-4 max-w-2xl mx-auto">
        {wishlist.map((item, index) => (
          <div
            key={`${item.id}-${index}`}
            className="bg-white border border-stone-200 hover:border-teal-300 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all animate-fadeUp"
          >
            <Link href={`/listing/${item.id}`}>
              <div className="flex gap-3 p-4 cursor-pointer hover:bg-stone-50 transition-colors">
                <div className="relative w-20 h-20 rounded-xl overflow-hidden flex-shrink-0">
                  <img
                    src={item.img?.startsWith("http") || item.img?.startsWith("/images/") ? item.img : `/images/${item.img}`}
                    alt={item.title}
                    loading="lazy"
                    decoding="async"
                    className="object-cover w-full h-full"
                  />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-stone-900 line-clamp-2 text-sm">
                    {item.title}
                  </p>
                  <p className="text-base font-bold mt-1" style={GRAD_TEXT}>
                    ₦{item.price?.toLocaleString()}
                  </p>
                </div>
              </div>
            </Link>

            <div className="flex justify-between items-center px-4 pb-4">
              <button
                onClick={() => handleAddToCart(item)}
                className="flex items-center gap-1.5 px-5 py-2.5 text-white font-semibold rounded-full text-sm shadow-lg shadow-teal-200/60 transition-all"
                style={{ background: GRAD }}>
                <Package className="w-4 h-4" />
                Add to Cart
              </button>

              <button
                onClick={() => {
                  removeFromWishlist(item.id);
                  showToast("Removed from Wishlist");
                }}
                className="p-2 text-red-400 hover:text-red-500 transition-colors">
                <Heart className="w-5 h-5 fill-red-400" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
