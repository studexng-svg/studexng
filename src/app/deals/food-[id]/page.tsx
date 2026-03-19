"use client";

import { Heart, Package, ArrowLeft, Star, Clock, Loader } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useCartStore } from "@/lib/cartStore";
import { useWishlistStore } from "@/lib/wishlistStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

interface Listing {
  id: number;
  title: string;
  description: string;
  price: string;
  image: string;
  is_available: boolean;
  category: string;
  vendor: string;
  vendor_business: string | null;
  vendor_is_verified: boolean;
}

export default function DealPage() {
  const { id } = useParams();
  const router = useRouter();
  const { addToCart } = useCartStore();
  const { wishlist, addToWishlist, removeFromWishlist } = useWishlistStore();

  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [quantity, setQuantity] = useState(1);

  const isLiked = wishlist.some((w) => w.id === Number(id));

  useEffect(() => {
    const fetchListing = async () => {
      try {
        const res = await fetch(`${API_URL}/api/services/listings/${id}/`);
        if (!res.ok) throw new Error("Not found");
        const data = await res.json();
        setListing(data);
      } catch {
        setListing(null);
      } finally {
        setLoading(false);
      }
    };
    fetchListing();
  }, [id]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
  };

  const handleAddToCart = () => {
    if (!listing) return;
    for (let i = 0; i < quantity; i++) {
      addToCart({
        id: listing.id,           // ← real DB id from API
        title: listing.title,
        price: parseFloat(listing.price),
        img: listing.image,
      });
    }
    showToast("Added to Cart!");
  };

  const toggleWishlist = () => {
    if (!listing) return;
    if (isLiked) {
      removeFromWishlist(listing.id);
      showToast("Removed from wishlist");
    } else {
      addToWishlist({
        id: listing.id,
        title: listing.title,
        price: parseFloat(listing.price),
        img: listing.image,
      });
      showToast("Added to wishlist!");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFF8F0]">
        <Loader className="w-10 h-10 text-purple-600 animate-spin" />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="min-h-screen bg-[#FFF8F0] flex items-center justify-center p-6">
        <div className="text-center">
          <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-600 text-lg font-medium">Product not found</p>
          <Link href="/home">
            <button className="mt-4 px-6 py-2 bg-purple-600 text-white rounded-full font-medium">
              Back to Home
            </button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* TOAST */}
      {toast && (
        <motion.div initial={{ y: -50, opacity: 0 }} animate={{ y: 60, opacity: 1 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full shadow-lg z-50 font-medium text-sm text-white bg-green-500">
          {toast}
        </motion.div>
      )}

      {/* TOP BAR */}
      <div className="sticky top-0 bg-white z-40 border-b shadow-sm">
        <div className="flex items-center justify-between p-4">
          <button onClick={() => router.back()} className="text-gray-700">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Product</h1>
          <motion.button onClick={toggleWishlist} whileTap={{ scale: 0.9 }}>
            <Heart className={`w-6 h-6 transition-all ${isLiked ? "fill-red-500 text-red-500" : "text-gray-400"}`} />
          </motion.button>
        </div>
      </div>

      <div className="pb-32 bg-[#FFF8F0] min-h-screen">
        {/* IMAGE */}
        <div className="relative h-72 w-full bg-gray-100">
          <Image
            src={listing.image?.startsWith("http") ? listing.image : `/images/${listing.image}`}
            alt={listing.title}
            fill
            className="object-cover"
            onError={(e) => { (e.target as HTMLImageElement).src = "/images/placeholder.jpg"; }}
          />
          {!listing.is_available && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <span className="text-white font-bold text-lg">Out of Stock</span>
            </div>
          )}
        </div>

        <div className="p-5 space-y-5">
          {/* TITLE + VENDOR */}
          <div>
            <h2 className="text-2xl font-black text-gray-900">{listing.title}</h2>
            <p className="text-sm text-purple-600 font-medium mt-1">
              {listing.vendor_business || listing.vendor}
              {listing.vendor_is_verified && (
                <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">✓ Verified</span>
              )}
            </p>
          </div>

          {/* PRICE */}
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <p className="text-3xl font-black text-purple-600">
              ₦{parseFloat(listing.price).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
            </p>
          </div>

          {/* DESCRIPTION */}
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <p className="font-bold text-gray-800 mb-2">Description</p>
            <p className="text-gray-600 text-sm leading-relaxed">{listing.description}</p>
          </div>

          {/* QUANTITY */}
          <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between">
            <p className="font-bold text-gray-800">Quantity</p>
            <div className="flex items-center gap-4">
              <motion.button whileTap={{ scale: 0.9 }}
                onClick={() => setQuantity(q => Math.max(1, q - 1))}
                className="w-9 h-9 rounded-full bg-purple-100 text-purple-700 font-black text-xl flex items-center justify-center">
                −
              </motion.button>
              <span className="text-xl font-black text-gray-900 w-6 text-center">{quantity}</span>
              <motion.button whileTap={{ scale: 0.9 }}
                onClick={() => setQuantity(q => q + 1)}
                className="w-9 h-9 rounded-full bg-purple-100 text-purple-700 font-black text-xl flex items-center justify-center">
                +
              </motion.button>
            </div>
          </div>

          {/* TOTAL */}
          <div className="bg-gradient-to-r from-purple-600 to-teal-500 rounded-2xl p-4 text-white flex justify-between items-center">
            <span className="font-bold">Total</span>
            <span className="text-2xl font-black">
              ₦{(parseFloat(listing.price) * quantity).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
            </span>
          </div>

          {/* ADD TO CART */}
          <motion.button
            whileHover={{ scale: listing.is_available ? 1.02 : 1 }}
            whileTap={{ scale: listing.is_available ? 0.98 : 1 }}
            onClick={handleAddToCart}
            disabled={!listing.is_available}
            className={`w-full py-5 rounded-2xl font-black text-xl shadow-lg flex items-center justify-center gap-3
              ${listing.is_available
                ? "bg-gradient-to-r from-purple-600 to-teal-500 text-white"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}>
            <Package className="w-6 h-6" />
            {listing.is_available ? "Add to Cart" : "Out of Stock"}
          </motion.button>
        </div>
      </div>
    </>
  );
}
