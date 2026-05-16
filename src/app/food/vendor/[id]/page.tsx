// src/app/food/vendor/[id]/page.tsx  ← FIXED INFINITE LOOP

"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { 
  Star, Clock, MapPin, Search, Plus, Heart, 
  ChevronLeft, Package, Zap, Shield, CheckCircle 
} from "lucide-react";
import { useState, useCallback, useMemo, useEffect } from "react";
import { useCartStore } from "@/lib/cartStore";
import { useWishlistStore } from "@/lib/wishlistStore";

const vendorData: Record<string, any> = {
  "1": { 
    name: "Mama Put", 
    rating: 4.9, 
    time: "10–15", 
    location: "Gate 2", 
    img: "vendor-mama.jpg", 
    dishes: 42, 
    verified: true, 
    open: true 
  },
  "2": { 
    name: "Jollof King", 
    rating: 4.9, 
    time: "12–18", 
    location: "Cafeteria Block", 
    img: "vendor-jollof.jpg", 
    dishes: 38, 
    verified: true, 
    open: true 
  },
  "3": { 
    name: "Indomie Spot", 
    rating: 4.7, 
    time: "8–12", 
    location: "Angola Hall", 
    img: "vendor-indomie.jpg", 
    dishes: 25, 
    verified: true, 
    open: true 
  },
};

const menu = [
  { id: 1, title: "Jollof Rice + Chicken", price: 1200, img: "jollof.jpg", category: "Rice", rating: 4.9, sales: "2.1k+" },
  { id: 2, title: "Eba + Egusi + Beef", price: 900, img: "eba.jpg", category: "Swallow", rating: 4.8, sales: "1.5k+" },
  { id: 3, title: "Indomie Supreme", price: 600, img: "indomie.jpg", category: "Noodles", rating: 4.7, sales: "3.2k+" },
  { id: 4, title: "Beef Shawarma", price: 1000, img: "shawarma.jpg", category: "Fast Food", rating: 4.8, sales: "1.8k+" },
  { id: 5, title: "Pounded Yam + Oha Soup", price: 1800, img: "pounded.jpg", category: "Swallow", rating: 5.0, sales: "890+" },
  { id: 6, title: "Fried Rice + Salad", price: 1100, img: "friedrice.jpg", category: "Rice", rating: 4.7, sales: "1.2k+" },
];

export default function VendorMenu() {
  const router = useRouter();
  const { id } = useParams();
  const vendorId = (Array.isArray(id) ? id[0] : id) ?? "1";
  const vendor = vendorData[vendorId] || vendorData["1"];

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");

  // FIX: Use direct store access instead of subscribing to items array
  const addToCart = useCartStore((state) => state.addToCart);
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlistStore();

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const showToast = useCallback((msg: string, isWishlist = false) => {
    const toast = document.createElement("div");
    toast.className = `fixed top-24 left-1/2 -translate-x-1/2 px-8 py-4 rounded-full shadow-2xl z-50 font-black text-white text-lg backdrop-blur-md transition-all ${
      isWishlist ? "bg-gradient-to-r from-pink-500 to-rose-500" : "bg-gradient-to-r from-purple-600 to-teal-600"
    }`;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
  }, []);

  const filtered = useMemo(() =>
    menu.filter(d =>
      (category === "All" || d.category === category) &&
      d.title.toLowerCase().includes(search.toLowerCase())
    ),
    [category, search]
  );

  const categories = ["All", "Rice", "Swallow", "Noodles", "Fast Food"];

  const handleAddToCart = (item: any, e: React.MouseEvent) => {
    e.stopPropagation();
    addToCart({ 
      id: item.id, 
      title: item.title, 
      price: item.price, 
      img: item.img,
      vendor: vendor.name
    });
    showToast("Added to Cart!");
  };

  const handleWishlist = (item: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (mounted && isInWishlist && isInWishlist(item.id)) {
      removeFromWishlist(item.id);
      showToast("Removed from Wishlist", true);
    } else {
      addToWishlist({ 
        id: item.id, 
        title: item.title, 
        price: item.price, 
        img: item.img,
        vendor: vendor.name
      });
      showToast("Saved to Wishlist", true);
    }
  };

  const checkWishlist = (itemId: number) => {
    return mounted && isInWishlist ? isInWishlist(itemId) : false;
  };

  const goToDish = (dishId: number) => {
    router.push(`/food/dish/${dishId}`);
  };

  return (
    <>
      {/* TOP BAR */}
      <div className="sticky top-0 bg-white/95 backdrop-blur-2xl z-50 border-b shadow-sm">
        <div className="flex items-center justify-between p-4 max-w-4xl mx-auto">
          <button onClick={() => router.back()} className="p-2 hover:bg-purple-100 rounded-full transition active:scale-95">
            <ChevronLeft className="w-6 h-6 text-purple-700" />
          </button>
          <h1 className="text-lg font-black bg-gradient-to-r from-purple-600 to-teal-600 bg-clip-text text-transparent">
            {vendor.name}
          </h1>
          <div className="w-10" />
        </div>

        {/* SEARCH */}
        <div className="px-4 pb-4 max-w-4xl mx-auto">
          <div className="relative">
            <Search className="absolute left-4 top-3 w-5 h-5 text-gray-500" />
            <input
              type="text"
              placeholder={`Search in ${vendor.name}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-gradient-to-r from-purple-50 to-teal-50 rounded-full focus:outline-none focus:ring-2 focus:ring-purple-300 text-base font-medium placeholder-gray-500 transition-all"
            />
          </div>
        </div>
      </div>

      <div className="pb-24 max-w-4xl mx-auto">

        {/* HERO VENDOR CARD */}
        <div className="relative h-56">
          <Image 
            src={`/images/${vendor.img}`} 
            alt={vendor.name} 
            fill 
            className="object-cover" 
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          
          <div className="absolute bottom-4 left-4 text-white">
            <h1 className="text-3xl font-black drop-shadow-xl flex items-center gap-2">
              {vendor.name}
              {vendor.verified && <CheckCircle className="w-6 h-6 text-blue-500" />}
            </h1>
            <p className="text-sm opacity-90 flex items-center gap-1 mt-1">
              <MapPin className="w-4 h-4" /> {vendor.location}
            </p>
            {vendor.open && (
              <div className="mt-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-bold px-4 py-1.5 rounded-full inline-flex items-center gap-2 text-xs">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                OPEN NOW
              </div>
            )}
          </div>
        </div>

        <div className="px-4 md:px-6 -mt-8 relative z-10 space-y-6">

          {/* STATS CARD */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="bg-white rounded-2xl shadow-xl p-5 border border-purple-100"
          >
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <Star className="w-8 h-8 text-yellow-500 fill-current mx-auto mb-1" />
                <p className="text-2xl font-black">{vendor.rating}</p>
                <p className="text-xs text-gray-600">Rating</p>
              </div>
              <div>
                <Clock className="w-8 h-8 text-teal-600 mx-auto mb-1" />
                <p className="text-2xl font-black">{vendor.time} min</p>
                <p className="text-xs text-gray-600">Delivery</p>
              </div>
              <div>
                <Package className="w-8 h-8 text-purple-600 mx-auto mb-1" />
                <p className="text-2xl font-black">{vendor.dishes}+</p>
                <p className="text-xs text-gray-600">Dishes</p>
              </div>
            </div>
          </motion.div>

          {/* ESCROW BANNER */}
          <div className="bg-gradient-to-r from-purple-50 to-teal-50 rounded-2xl p-5 text-center border-2 border-purple-200">
            <Shield className="w-12 h-12 text-purple-600 mx-auto mb-2" />
            <p className="font-black text-lg bg-gradient-to-r from-purple-600 to-teal-600 bg-clip-text text-transparent">
              100% Escrow Protected
            </p>
            <p className="text-gray-700 text-sm mt-1">Pay only when food arrives hot & fresh</p>
          </div>

          {/* CATEGORIES */}
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`px-5 py-2.5 rounded-full font-bold text-sm transition-all whitespace-nowrap ${
                  category === cat
                    ? "bg-gradient-to-r from-purple-600 to-teal-600 text-white shadow-lg"
                    : "bg-gray-100 text-gray-700 hover:bg-purple-50"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* MENU GRID */}
          <div className="space-y-4">
            {filtered.map((dish, i) => (
              <motion.div
                key={dish.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                whileHover={{ y: -4 }}
                onClick={() => goToDish(dish.id)}
                className="bg-white rounded-2xl shadow-lg border border-purple-100 overflow-hidden cursor-pointer group"
              >
                <div className="flex">
                  <div className="relative w-28 h-28 flex-shrink-0">
                    <Image src={`/images/${dish.img}`} alt={dish.title} fill className="object-cover group-hover:scale-110 transition" />
                    {dish.sales && (
                      <div className="absolute top-2 left-2 bg-gradient-to-r from-orange-500 to-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                        {dish.sales}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 p-4 flex flex-col justify-between">
                    <div>
                      <h3 className="text-lg font-black text-gray-900 line-clamp-1">{dish.title}</h3>
                      <p className="text-xs text-gray-600 mt-0.5">{dish.category}</p>
                      <div className="flex items-center gap-1 mt-1">
                        <Star className="w-4 h-4 text-yellow-500 fill-current" />
                        <span className="font-bold text-sm">{dish.rating}</span>
                      </div>
                    </div>
                    <div className="text-2xl font-black bg-gradient-to-r from-purple-600 to-teal-600 bg-clip-text text-transparent">
                      ₦{dish.price.toLocaleString()}
                    </div>
                  </div>

                  {/* ACTION BUTTONS */}
                  <div className="flex flex-col justify-center gap-3 pr-4">
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={(e) => handleAddToCart(dish, e)}
                      className="p-3 bg-gradient-to-r from-purple-600 to-teal-600 rounded-full shadow-lg"
                    >
                      <Plus className="w-5 h-5 text-white" />
                    </motion.button>

                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={(e) => handleWishlist(dish, e)}
                      className="p-3 bg-white rounded-full shadow-lg ring-2 ring-purple-100"
                    >
                      <Heart className={`w-5 h-5 transition-all ${checkWishlist(dish.id) ? "fill-pink-500 text-pink-500" : "text-gray-600"}`} />
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}