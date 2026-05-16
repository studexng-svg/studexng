// src/app/drinks/[id]/page.tsx
"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { useRouter, useParams } from "next/navigation";
import { Star, Heart, ChevronLeft, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useCartStore } from "@/lib/cartStore";
import { useWishlistStore } from "@/lib/wishlistStore";

const drinkData: Record<string, any> = {
  "1": { title: "Zobo + Ginger", price: 500, img: "zobo.jpg", vendor: "Zobo Queen", desc: "Freshly made zobo with extra ginger kick. Chilled perfection.", size: "500ml", rating: 4.9, reviews: 892 },
  "2": { title: "Chapman Deluxe", price: 800, img: "chapman.jpg", vendor: "Chill Spot", desc: "Classic Nigerian Chapman with Fanta, Sprite, Angostura & cucumber.", size: "700ml", rating: 4.8, reviews: 761 },
  "3": { title: "Pineapple Smoothie", price: 1200, img: "smoothie.jpg", vendor: "Smoothy Bae", desc: "Blended fresh pineapple, banana & yogurt. Creamy tropical vibes.", size: "600ml", rating: 5.0, reviews: 1021 },
  "4": { title: "Kunnu Aya", price: 600, img: "kunnu.jpg", vendor: "Tiger Nut Plug", desc: "Authentic tiger nut milk. Sweet, creamy, and 100% natural.", size: "500ml", rating: 4.9, reviews: 687 },
  "5": { title: "Mango Magic", price: 1100, img: "mango-drink.jpg", vendor: "Chill Spot", desc: "Pure mango blend with a hint of lime. Summer in a cup.", size: "600ml", rating: 4.9, reviews: 543 },
};

export default function DrinkDetail() {
  const router = useRouter();
  const { id } = useParams();
  const drinkId = (Array.isArray(id) ? id[0] : id) ?? "1";
  const drink = drinkData[drinkId] || drinkData["1"];
  const numericId = parseInt(drinkId);

  const [localWishlist, setLocalWishlist] = useState<Set<number>>(new Set());

  const addToCart = useCartStore((s) => s.addToCart);
  const addToWishlist = useWishlistStore((s) => s.addToWishlist);
  const removeFromWishlist = useWishlistStore((s) => s.removeFromWishlist);

  useEffect(() => {
    const items = useWishlistStore.getState().wishlist ?? [];
    setLocalWishlist(new Set(items.map(i => i.id)));
  }, []);

  useEffect(() => {
    const unsub = useWishlistStore.subscribe((state) => {
      setLocalWishlist(new Set(state.wishlist?.map(i => i.id) || []));
    });
    return unsub;
  }, []);

  const isInWishlist = useMemo(() => localWishlist.has(numericId), [localWishlist, numericId]);

  const showToast = useCallback((msg: string, isWishlist = false) => {
    const toast = document.createElement("div");
    toast.className = `fixed top-20 left-1/2 -translate-x-1/2 px-8 py-4 rounded-full shadow-2xl z-50 font-black text-white text-lg backdrop-blur-md ${isWishlist ? "bg-gradient-to-r from-pink-500 to-rose-500" : "bg-gradient-to-r from-purple-600 to-teal-600"}`;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2200);
  }, []);

  const handleAddToCart = useCallback(() => {
    addToCart({ 
      id: numericId, 
      title: drink.title, 
      price: drink.price, 
      img: drink.img, 
      category: "Drinks",
      size: drink.size 
    });
    showToast("Added to Cart!");
  }, [addToCart, numericId, drink, showToast]);

  const handleWishlist = useCallback(() => {
    if (isInWishlist) {
      removeFromWishlist(numericId);
      setLocalWishlist(prev => { const n = new Set(prev); n.delete(numericId); return n; });
      showToast("Removed from Wishlist", true);
    } else {
      addToWishlist({ id: numericId, title: drink.title, price: drink.price, img: drink.img });
      setLocalWishlist(prev => new Set(prev).add(numericId));
      showToast("Added to Wishlist", true);
    }
  }, [isInWishlist, removeFromWishlist, addToWishlist, numericId, drink, showToast]);

  return (
    <>
      {/* TOP BAR */}
      <motion.div initial={{ y: -20 }} animate={{ y: 0 }} className="sticky top-0 bg-white/80 backdrop-blur-xl z-40 border-b border-gray-100">
        <div className="flex items-center p-4">
          <button onClick={() => router.back()} className="p-3 hover:bg-purple-100 rounded-full transition">
            <ChevronLeft className="w-7 h-7 text-purple-600" />
          </button>
          <h1 className="ml-3 text-xl font-black bg-gradient-to-r from-purple-600 to-teal-600 bg-clip-text text-transparent">
            Drink Detail
          </h1>
        </div>
      </motion.div>

      <div className="p-6 space-y-8 pb-32">
        {/* HERO IMAGE */}
        <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="relative h-80 rounded-3xl overflow-hidden shadow-2xl">
          <Image 
            src={`/images/${drink.img}`} 
            alt={drink.title} 
            fill 
            className="object-cover" 
            priority 
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          
          {/* Floating Heart */}
          <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={handleWishlist}
            className="absolute top-4 right-4 p-4 bg-white/90 backdrop-blur rounded-full shadow-xl">
            <Heart className={`w-7 h-7 ${isInWishlist ? "fill-pink-500 text-pink-500" : "text-gray-700"}`} />
          </motion.button>

          {/* Size Badge */}
          <div className="absolute bottom-4 left-4 px-4 py-2 bg-white/90 backdrop-blur rounded-full shadow-xl">
            <p className="font-black text-purple-600">{drink.size}</p>
          </div>
        </motion.div>

        {/* CONTENT */}
        <div className="space-y-5">
          <div>
            <h1 className="text-3xl font-black text-gray-900">{drink.title}</h1>
            <p className="text-lg text-gray-600 mt-1">by <span className="font-bold text-purple-600">{drink.vendor}</span></p>
          </div>

          <div className="flex items-center gap-3">
            <Star className="w-6 h-6 text-yellow-500 fill-current" />
            <span className="text-xl font-black">{drink.rating}</span>
            <span className="text-gray-500">({drink.reviews} reviews)</span>
          </div>

          <p className="text-base text-gray-700 leading-relaxed">{drink.desc}</p>

          <div className="text-4xl font-black bg-gradient-to-r from-purple-600 to-teal-600 bg-clip-text text-transparent">
            ₦{drink.price.toLocaleString()}
          </div>
        </div>

        {/* ACTION BUTTONS */}
        <div className="flex gap-4 pt-6">
          <motion.button 
            whileHover={{ scale: 1.02 }} 
            whileTap={{ scale: 0.98 }} 
            onClick={handleAddToCart}
            className="flex-1 py-5 bg-gradient-to-r from-purple-600 to-teal-600 text-white font-black text-xl rounded-2xl shadow-2xl flex items-center justify-center gap-3"
          >
            <Plus className="w-7 h-7" />
            Add to Cart
          </motion.button>

          <motion.button 
            whileHover={{ scale: 1.1 }} 
            whileTap={{ scale: 0.9 }} 
            onClick={handleWishlist}
            className="p-5 bg-gradient-to-r from-pink-100 to-rose-100 rounded-2xl shadow-xl"
          >
            <Heart className={`w-8 h-8 ${isInWishlist ? "fill-pink-500 text-pink-500" : "text-gray-600"}`} />
          </motion.button>
        </div>
      </div>

      {/* BOTTOM NAV */}
      <motion.div initial={{ y: 100 }} animate={{ y: 0 }} className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t z-50 shadow-2xl">
        <div className="flex justify-around py-3">
          <div className="text-gray-500 text-xs">Home</div>
          <div className="text-purple-600 font-black text-sm">Drinks</div>
          <div className="text-gray-500 text-xs">Cart</div>
          <div className="text-gray-500 text-xs">Wishlist</div>
          <div className="text-gray-500 text-xs">Account</div>
        </div>
      </motion.div>
    </>
  );
}