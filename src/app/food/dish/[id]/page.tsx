// src/app/food/dish/[id]/page.tsx  ← FIXED WISHLIST & RESPONSIVE

"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { 
  Star, Heart, ShoppingCart, ChevronLeft, 
  Clock, Shield, Zap 
} from "lucide-react";
import { useCallback, useState, useEffect } from "react";
import { useCartStore } from "@/lib/cartStore";
import { useWishlistStore } from "@/lib/wishlistStore";

const dishData: Record<string, any> = {
  "1": {
    id: 1,
    title: "Jollof Rice + Chicken",
    price: 1200,
    img: "jollof.jpg",
    vendor: "Mama Put",
    location: "Gate 2",
    desc: "Spicy Nigerian jollof with perfectly grilled chicken, plantain, coleslaw, and love.",
    rating: 4.9,
    reviews: 2142,
    time: "12–18 mins",
    sales: "2.1k+",
    badge: "Bestseller",
  },
  "2": {
    id: 2,
    title: "Beef Shawarma",
    price: 1000,
    img: "shawarma.jpg",
    vendor: "Shawarma Palace",
    location: "Library Road",
    desc: "Juicy beef, garlic sauce, veggies wrapped in soft Lebanese bread. Pure bliss.",
    rating: 4.8,
    reviews: 1809,
    time: "15–20 mins",
    sales: "1.8k+",
    badge: "Trending",
  },
  "3": {
    id: 3,
    title: "Indomie Supreme",
    price: 600,
    img: "indomie.jpg",
    vendor: "Indomie Spot",
    location: "Angola Hall",
    desc: "Double egg, sausage, plantain, extra pepper. The king of midnight fuel.",
    rating: 4.7,
    reviews: 3200,
    time: "8–12 mins",
    sales: "3.2k+",
    badge: "Campus King",
  },
  "4": {
    id: 4,
    title: "Eba + Egusi + Beef",
    price: 900,
    img: "eba.jpg",
    vendor: "Mama Put",
    location: "Gate 2",
    desc: "Smooth eba with rich egusi soup, assorted meat, and pounded yam energy.",
    rating: 4.9,
    reviews: 1520,
    time: "20–25 mins",
    sales: "1.5k+",
  },
};

export default function FoodDishDetail() {
  const router = useRouter();
  const { id } = useParams();
  const dishId = (Array.isArray(id) ? id[0] : id) ?? "1";
  const dish = dishData[dishId] || dishData["1"];

  const addToCart = useCartStore((state) => state.addToCart);
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlistStore();

  // Local state to track wishlist status
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Mount and check wishlist status
  useEffect(() => {
    setMounted(true);
    if (typeof isInWishlist === 'function') {
      setIsWishlisted(isInWishlist(dish.id));
    }
  }, [dish.id, isInWishlist]);

  const showToast = useCallback((msg: string, isWishlist = false) => {
    const toast = document.createElement("div");
    toast.className = `fixed top-20 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full shadow-2xl z-50 font-bold text-white text-sm backdrop-blur-md ${
      isWishlist 
        ? "bg-gradient-to-r from-pink-500 to-rose-500" 
        : "bg-gradient-to-r from-purple-600 to-teal-600"
    }`;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
  }, []);

  const handleAddToCart = () => {
    addToCart({
      id: dish.id,
      title: dish.title,
      price: dish.price,
      img: dish.img,
      vendor: dish.vendor,
      category: "Food"
    });
    showToast("Added to Cart!");
  };

  const toggleWishlist = () => {
    if (isWishlisted) {
      removeFromWishlist(dish.id);
      setIsWishlisted(false);
      showToast("Removed from Wishlist", true);
    } else {
      addToWishlist({
        id: dish.id,
        title: dish.title,
        price: dish.price,
        img: dish.img,
        vendor: dish.vendor
      });
      setIsWishlisted(true);
      showToast("Saved to Wishlist", true);
    }
  };

  return (
    <>
      {/* TOP BAR */}
      <div className="sticky top-0 bg-white/95 backdrop-blur-2xl z-50 border-b shadow-sm">
        <div className="flex items-center justify-between p-4 max-w-4xl mx-auto">
          <button 
            onClick={() => router.back()} 
            className="p-2 hover:bg-purple-100 rounded-full transition active:scale-95"
          >
            <ChevronLeft className="w-6 h-6 text-purple-700" />
          </button>
          <h1 className="text-lg font-black bg-gradient-to-r from-purple-600 to-teal-600 bg-clip-text text-transparent">
            Order Food
          </h1>
          <div className="w-10" />
        </div>
      </div>

      <div className="pb-24 max-w-4xl mx-auto">

        {/* HERO IMAGE */}
        <div className="relative h-64 md:h-80">
          <Image 
            src={`/images/${dish.img}`} 
            alt={dish.title} 
            fill 
            className="object-cover" 
            priority 
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

          {/* Floating Heart */}
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={toggleWishlist}
            className="absolute top-4 right-4 p-3 bg-white/90 backdrop-blur-xl rounded-full shadow-xl"
          >
            <Heart 
              className={`w-6 h-6 transition-all ${
                isWishlisted 
                  ? "fill-pink-500 text-pink-500" 
                  : "text-gray-700"
              }`} 
            />
          </motion.button>

          {/* Badge */}
          {dish.badge && (
            <div className="absolute top-4 left-4 bg-gradient-to-r from-purple-600 to-teal-600 text-white font-bold px-4 py-1.5 rounded-full shadow-xl text-xs">
              {dish.badge}
            </div>
          )}

          {/* Vendor Info */}
          <div className="absolute bottom-4 left-4 text-white">
            <p className="text-xs opacity-90">by</p>
            <p className="text-xl font-black drop-shadow-xl">{dish.vendor}</p>
            <p className="text-xs opacity-90 flex items-center gap-1 mt-1">
              <Clock className="w-4 h-4" /> {dish.time}
            </p>
          </div>
        </div>

        <div className="px-4 md:px-6 -mt-8 relative z-10 space-y-6">

          {/* MAIN CARD */}
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="bg-white rounded-2xl shadow-xl p-5 md:p-6 border border-purple-100"
          >
            <h1 className="text-2xl md:text-3xl font-black text-gray-900">{dish.title}</h1>

            <div className="flex flex-wrap items-center gap-3 mt-3">
              <div className="flex items-center gap-2">
                <Star className="w-5 h-5 text-yellow-500 fill-current" />
                <span className="text-xl font-black">{dish.rating}</span>
                <span className="text-gray-600 text-sm">({dish.reviews.toLocaleString()})</span>
              </div>
              <div className="flex items-center gap-2 text-gray-600 text-sm">
                <Zap className="w-4 h-4 text-purple-600" />
                <span className="font-bold">{dish.sales} ordered</span>
              </div>
            </div>

            <p className="text-base text-gray-700 mt-4 leading-relaxed">{dish.desc}</p>

            <div className="mt-6 text-4xl md:text-5xl font-black bg-gradient-to-r from-purple-600 to-teal-600 bg-clip-text text-transparent">
              ₦{dish.price.toLocaleString()}
            </div>
          </motion.div>

          {/* ESCROW */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-gradient-to-r from-purple-50 to-teal-50 rounded-2xl p-5 text-center border-2 border-purple-200"
          >
            <Shield className="w-12 h-12 text-purple-600 mx-auto mb-2" />
            <p className="font-black text-lg bg-gradient-to-r from-purple-600 to-teal-600 bg-clip-text text-transparent">
              100% Escrow Protected
            </p>
            <p className="text-gray-700 mt-1 text-sm">Pay only when food arrives hot & fresh</p>
          </motion.div>

          {/* ACTION BUTTONS */}
          <div className="space-y-3">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleAddToCart}
              className="w-full py-5 bg-gradient-to-r from-purple-600 to-teal-600 text-white font-black text-xl rounded-2xl shadow-xl flex items-center justify-center gap-3"
            >
              <ShoppingCart className="w-6 h-6" />
              Add to Cart • ₦{dish.price.toLocaleString()}
            </motion.button>

            <Link href="/cart" className="block">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full py-4 bg-gray-100 text-purple-700 font-bold text-lg rounded-2xl shadow-md hover:bg-purple-100 transition"
              >
                Go to Cart → Checkout
              </motion.button>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}