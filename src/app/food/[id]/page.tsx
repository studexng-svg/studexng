// src/app/food/[id]/page.tsx  ← FOOD DETAIL PAGE (GOD TIER STUDEx DESIGN)

"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { 
  Star, Heart, ShoppingCart, ChevronLeft, MapPin, 
  MessageCircle, CheckCircle, Package, Zap, Shield 
} from "lucide-react";
import { useState, useEffect } from "react";
import { useCartStore } from "@/lib/cartStore";
import { useWishlistStore } from "@/lib/wishlistStore";

const foodProducts: Record<string, any> = {
  "1": {
    id: 1,
    name: "Jollof Rice + Chicken",
    price: 2500,
    img: "jollof.jpg",
    rating: 4.9,
    reviews: 128,
    description: "Authentic Nigerian jollof rice with perfectly grilled chicken, plantain, and coleslaw. Campus favorite!",
    vendor: {
      name: "Mama Put",
      avatar: "vendor-mama.jpg",
      location: "Gate 2",
      rating: 4.9,
      sales: 2100,
      verified: true,
      open: true,
    },
  },
  "2": {
    id: 2,
    name: "Beef Suya (10 Sticks)",
    price: 3000,
    img: "suya.jpg",
    rating: 4.8,
    reviews: 95,
    description: "Spicy grilled beef suya with onions, tomatoes, and signature spice mix. Perfect for late nights.",
    vendor: {
      name: "Suya King",
      avatar: "vendor-suya.jpg",
      location: "Hostel A",
      rating: 4.9,
      sales: 1800,
      verified: true,
      open: true,
    },
  },
  "3": {
    id: 3,
    name: "Indomie Supreme",
    price: 600,
    img: "indomie.jpg",
    rating: 4.7,
    reviews: 3200,
    description: "Double egg, sausage, plantain, and extra spice. The ultimate student fuel.",
    vendor: {
      name: "Indomie Spot",
      avatar: "vendor-indomie.jpg",
      location: "Angola Hall",
      rating: 4.7,
      sales: 5000,
      verified: true,
      open: true,
    },
  },
};

export default function FoodDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const product = foodProducts[id as string] || foodProducts["1"];

  const addToCart = useCartStore((state) => state.addToCart);
  const { wishlist, addToWishlist, removeFromWishlist } = useWishlistStore();
  const [isWishlisted, setIsWishlisted] = useState(false);

  useEffect(() => {
    setIsWishlisted(wishlist.some(item => item.id === product.id));
  }, [wishlist, product.id]);

  const handleAddToCart = () => {
    addToCart({
      id: product.id,
      title: product.name,
      price: product.price,
      img: product.img,
      category: "Food"
    });
    showToast("Added to Cart!");
  };

  const toggleWishlist = () => {
    if (isWishlisted) {
      removeFromWishlist(product.id);
      showToast("Removed from Wishlist", true);
    } else {
      addToWishlist({
        id: product.id,
        title: product.name,
        price: product.price,
        img: product.img
      });
      showToast("Added to Wishlist", true);
    }
    setIsWishlisted(!isWishlisted);
  };

  const showToast = (msg: string, isWishlist = false) => {
    const toast = document.createElement("div");
    toast.className = `fixed top-20 left-1/2 -translate-x-1/2 px-8 py-4 rounded-full shadow-2xl z-50 font-black text-white text-lg backdrop-blur-md ${isWishlist ? "bg-gradient-to-r from-pink-500 to-rose-500" : "bg-gradient-to-r from-purple-600 to-teal-600"}`;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
  };

  const openWhatsApp = () => {
    const message = `Hi! I'm interested in your *${product.name}* (₦${product.price.toLocaleString()}). Is it still available?`;
    const url = `https://wa.me/2348123456789?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
  };

  return (
    <>
      {/* TOP BAR */}
      <div className="sticky top-0 bg-white/95 backdrop-blur-2xl z-50 border-b">
        <div className="flex items-center justify-between p-4">
          <button onClick={() => router.back()} className="p-3 hover:bg-purple-100 rounded-full transition active:scale-95">
            <ChevronLeft className="w-8 h-8 text-purple-700" />
          </button>
          <h1 className="text-xl font-black bg-gradient-to-r from-purple-600 to-teal-600 bg-clip-text text-transparent">
            Food Details
          </h1>
          <div className="w-12" />
        </div>
      </div>

      <div className="pb-32">

        {/* HERO IMAGE */}
        <div className="relative h-80">
          <Image 
            src={`/images/${product.img}`} 
            alt={product.name} 
            fill 
            className="object-cover" 
            priority 
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

          {/* Floating Heart */}
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={toggleWishlist}
            className="absolute top-6 right-6 p-4 bg-white/90 backdrop-blur rounded-full shadow-2xl"
          >
            <Heart className={`w-7 h-7 transition-all ${isWishlisted ? "fill-pink-500 text-pink-500" : "text-gray-700"}`} />
          </motion.button>

          {/* Bestseller Badge */}
          {product.reviews > 1000 && (
            <div className="absolute top-6 left-6 bg-gradient-to-r from-purple-600 to-teal-600 text-white font-black px-5 py-2 rounded-full shadow-2xl text-sm">
              CAMPUS FAVORITE
            </div>
          )}
        </div>

        <div className="px-6 -mt-12 relative z-10 space-y-8">

          {/* PRODUCT CARD */}
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="bg-white rounded-3xl shadow-2xl p-6 border-2 border-purple-100"
          >
            <h1 className="text-3xl font-black text-gray-900">{product.name}</h1>
            
            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-2">
                <Star className="w-7 h-7 text-yellow-500 fill-current" />
                <span className="text-2xl font-black">{product.rating}</span>
                <span className="text-gray-600">({product.reviews} reviews)</span>
              </div>
            </div>

            <p className="text-lg text-gray-700 mt-4 leading-relaxed">{product.description}</p>

            <div className="mt-6 text-5xl font-black bg-gradient-to-r from-purple-600 to-teal-600 bg-clip-text text-transparent">
              ₦{product.price.toLocaleString()}
            </div>
          </motion.div>

          {/* VENDOR CARD */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-3xl shadow-2xl p-6 border-2 border-purple-100 flex items-center gap-5"
          >
            <div className="relative w-24 h-24 rounded-3xl overflow-hidden ring-4 ring-purple-100">
              <Image src={`/images/${product.vendor.avatar}`} alt={product.vendor.name} fill className="object-cover" />
              {product.vendor.open && (
                <div className="absolute top-2 right-2 bg-gradient-to-r from-purple-600 to-teal-600 text-white text-xs font-black px-3 py-1 rounded-full animate-pulse">
                  OPEN
                </div>
              )}
            </div>

            <div className="flex-1">
              <h3 className="text-xl font-black flex items-center gap-2">
                {product.vendor.name}
                {product.vendor.verified && <CheckCircle className="w-6 h-6 text-blue-600" />}
              </h3>
              <p className="text-gray-600 flex items-center gap-1 mt-1">
                <MapPin className="w-5 h-5" /> {product.vendor.location}
              </p>
              <div className="flex items-center gap-4 mt-3 text-sm">
                <span className="font-bold">{product.vendor.rating} stars</span>
                <span className="text-gray-600">{product.vendor.sales}+ orders</span>
              </div>
            </div>
          </motion.div>

          {/* WHATSAPP & ACTIONS */}
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="space-y-4"
          >
            <button
              onClick={openWhatsApp}
              className="w-full py-5 bg-green-500 hover:bg-green-600 text-white font-black text-xl rounded-3xl shadow-2xl flex items-center justify-center gap-3 transition-all"
            >
              <MessageCircle className="w-8 h-8" />
              Chat on WhatsApp
            </button>

            <button
              onClick={handleAddToCart}
              className="w-full py-6 bg-gradient-to-r from-purple-600 to-teal-600 text-white font-black text-2xl rounded-3xl shadow-2xl flex items-center justify-center gap-4 hover:shadow-3xl transition-all"
            >
              <ShoppingCart className="w-9 h-9" />
              Add to Cart • ₦{product.price.toLocaleString()}
            </button>
          </motion.div>

          {/* ESCROW PROTECTION */}
          <div className="bg-gradient-to-r from-purple-50 to-teal-50 rounded-3xl p-6 text-center border-2 border-purple-200">
            <Shield className="w-14 h-14 text-purple-600 mx-auto mb-3" />
            <p className="font-black text-xl">100% Escrow Protected</p>
            <p className="text-gray-700 mt-1">Pay only when food arrives hot & fresh</p>
          </div>
        </div>
      </div>

      {/* BOTTOM NAV */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t z-50 shadow-2xl">
        <div className="flex justify-around py-3">
          <Link href="/" className="text-gray-500 text-xs">Home</Link>
          <Link href="/categories" className="text-gray-500 text-xs">Services</Link>
          <Link href="/food" className="text-purple-600 font-black text-sm">Food</Link>
          <Link href="/cart" className="text-gray-500 text-xs">Cart</Link>
          <Link href="/account" className="text-gray-500 text-xs">Account</Link>
        </div>
      </div>
    </>
  );
}