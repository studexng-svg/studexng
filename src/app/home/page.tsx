// src/app/home/page.tsx
"use client";

import { useEffect, useState } from "react";
import { Search, LogIn, UserPlus, Package, Zap, ArrowRight, Heart, X } from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { useAuth } from "@/lib/authStore";
import { useCartStore } from "@/lib/cartStore";
import { useWishlistStore } from "@/lib/wishlistStore";
import ThemeToggle from "@/components/ThemeToggle";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

// Safe image component — uses next/image for http URLs, plain div for missing images
function SafeImage({ src, alt, fill, sizes, className }: {
  src: string | null | undefined;
  alt: string;
  fill?: boolean;
  sizes?: string;
  className?: string;
}) {
  const [error, setError] = useState(false);
  if (!src || error || !src.startsWith("http")) {
    return (
      <div className={`w-full h-full bg-gradient-to-br from-purple-100 to-teal-100 dark:from-purple-900/30 dark:to-teal-900/30 flex items-center justify-center ${className || ""}`}>
        <span className="text-3xl">✨</span>
      </div>
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      fill={fill}
      sizes={sizes}
      className={className}
      onError={() => setError(true)}
    />
  );
}

export default function HomePage() {
  const { isLoggedIn } = useAuth();
  const addToCart = useCartStore((state) => state.addToCart);
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlistStore();

  const [mounted, setMounted] = useState(false);
  const [toast, setToast] = useState("");
  const [categories, setCategories] = useState<any[]>([]);
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const [catRes, listRes] = await Promise.all([
          fetch(`${API_URL}/api/services/categories/`),
          fetch(`${API_URL}/api/services/listings/`),
        ]);
        const catData = await catRes.json();
        const listData = await listRes.json();
        setCategories(catData.results || catData || []);
        setListings(listData.results || listData || []);
      } catch (err: any) {
        setError(err.message || "Failed to load data");
        setCategories([]);
        setListings([]);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`${API_URL}/api/services/listings/?search=${encodeURIComponent(searchQuery)}`);
        const data = await res.json();
        setSearchResults(data.results || data || []);
        setShowResults(true);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
  };

  const fadeInUp = { initial: { opacity: 0, y: 20 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true }, transition: { duration: 0.5 } };
  const cardHover = { whileHover: { y: -4, scale: 1.02 }, whileTap: { scale: 0.98 } };
  const buttonHover = { whileHover: { scale: 1.05 }, whileTap: { scale: 0.95 } };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFF8F0] dark:bg-gray-950 flex flex-col items-center justify-center gap-6">
        <motion.div className="relative" animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>
          <div className="w-24 h-24 border-8 border-purple-200 border-t-purple-600 rounded-full" />
        </motion.div>
        <motion.p className="bg-gradient-to-r from-teal-600 to-purple-600 bg-clip-text text-transparent font-black text-xl"
          animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.5, repeat: Infinity }}>
          Loading StudEx... ✨
        </motion.p>
      </div>
    );
  }

  return (
    <>
      {toast && (
        <motion.div initial={{ y: -50, opacity: 0 }} animate={{ y: 60, opacity: 1 }}
          className={`fixed top-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full shadow-lg z-50 font-medium text-sm text-white ${toast.includes("Wishlist") ? "bg-red-500" : "bg-green-500"}`}>
          {toast}
        </motion.div>
      )}

      {/* TOP BAR */}
      <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        className="sticky top-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur-lg z-40 border-b border-purple-100 dark:border-gray-800 shadow-sm">
        <div className="flex items-center justify-between p-4 gap-3">
          <Link href="/home" className="flex items-center gap-2 flex-shrink-0">
            {/* Use regular img tag for logo to avoid next/image local path issues */}
            <img src="/images/logo-1.jpg" alt="StudEx" className="w-11 h-11 rounded-full object-cover shadow-lg" />
            <span className="font-black text-xl bg-gradient-to-r from-teal-600 to-purple-600 bg-clip-text text-transparent">StudEx</span>
          </Link>

          <div className="flex items-center gap-2 flex-1 justify-end">
            {isLoggedIn ? (
              <div className="relative flex-1 max-w-xs">
                <Search className="w-4 h-4 absolute left-3 top-3 text-purple-500 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onFocus={() => searchResults.length > 0 && setShowResults(true)}
                  onBlur={() => setTimeout(() => setShowResults(false), 200)}
                  placeholder="Search listings..."
                  className="w-full pl-9 pr-8 py-2.5 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 border-2 border-purple-100 dark:border-gray-700 placeholder:text-gray-400 transition-all"
                />
                {searchQuery && (
                  <button onClick={() => { setSearchQuery(""); setShowResults(false); }}
                    className="absolute right-3 top-3 text-gray-400 hover:text-gray-600">
                    <X className="w-4 h-4" />
                  </button>
                )}
                <AnimatePresence>
                  {showResults && (
                    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      className="absolute top-full mt-2 left-0 right-0 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700 z-50 overflow-hidden max-h-72 overflow-y-auto">
                      {searching ? (
                        <div className="p-4 text-center text-gray-400 text-sm">Searching...</div>
                      ) : searchResults.length === 0 ? (
                        <div className="p-4 text-center text-gray-400 text-sm">No results for "{searchQuery}"</div>
                      ) : (
                        searchResults.map(item => (
                          <Link key={item.id} href={`/category/${item.category?.slug || item.category}`}
                            onClick={() => { setShowResults(false); setSearchQuery(""); }}>
                            <div className="flex items-center gap-3 p-3 hover:bg-purple-50 dark:hover:bg-gray-700 transition border-b border-gray-50 dark:border-gray-700 last:border-0 cursor-pointer">
                              <div className="w-10 h-10 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0 relative">
                                <SafeImage
                                  src={item.image?.startsWith("http") ? item.image : null}
                                  alt={item.title}
                                  fill
                                  sizes="40px"
                                  className="object-cover"
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-bold text-gray-900 dark:text-white text-sm truncate">{item.title}</p>
                                <p className="text-xs text-gray-500">by @{item.vendor?.username || item.vendor}</p>
                              </div>
                              <p className="text-purple-600 font-black text-sm flex-shrink-0">₦{Number(item.price).toLocaleString()}</p>
                            </div>
                          </Link>
                        ))
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <div className="flex gap-2">
                <Link href="/auth">
                  <motion.button {...buttonHover} className="flex items-center gap-1 px-4 py-2 bg-gradient-to-r from-teal-500 to-purple-600 text-white rounded-full text-sm font-bold shadow">
                    <LogIn className="w-4 h-4" /> Login
                  </motion.button>
                </Link>
                <Link href="/auth">
                  <motion.button {...buttonHover} className="flex items-center gap-1 px-4 py-2 bg-white dark:bg-gray-800 text-purple-600 rounded-full text-sm font-bold border-2 border-purple-200 dark:border-gray-700">
                    <UserPlus className="w-4 h-4" /> Sign Up
                  </motion.button>
                </Link>
              </div>
            )}
            <ThemeToggle />
          </div>
        </div>
      </motion.div>

      <div className="min-h-screen bg-[#FFF8F0] dark:bg-gray-950">
        <div className="p-4 space-y-6 pb-28">

          {/* HERO */}
          <motion.div {...fadeInUp}>
            <Link href="/categories">
              <motion.div {...cardHover}
                className="relative rounded-3xl p-8 text-white shadow-2xl cursor-pointer overflow-hidden h-52 bg-gradient-to-br from-teal-500 via-purple-600 to-pink-500">
                <div className="absolute top-4 right-4 text-4xl opacity-30">🎓</div>
                <div className="absolute bottom-4 left-4 text-3xl opacity-20">📚</div>
                <div className="relative z-10 h-full flex flex-col justify-end">
                  <h2 className="text-3xl font-black drop-shadow-2xl">🎯 The Student Marketplace</h2>
                  <p className="text-base mt-1 text-white/90 font-medium">Everything you need, one tap away ⚡</p>
                  <button className="mt-4 bg-white/20 backdrop-blur-sm text-white px-6 py-2.5 rounded-full font-black inline-flex items-center gap-2 w-fit border border-white/40 text-sm">
                    <Package className="w-4 h-4" /> Explore Services
                  </button>
                </div>
              </motion.div>
            </Link>
          </motion.div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-center">
              <p className="text-red-600 text-sm">{error}</p>
              <button onClick={() => window.location.reload()} className="mt-2 text-red-600 underline text-sm">Retry</button>
            </div>
          )}

          {/* CATEGORIES */}
          <motion.div {...fadeInUp}>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-500 animate-pulse" /> Browse Categories
            </h3>
            <div className="flex space-x-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
              {categories.length === 0 ? (
                <p className="text-gray-400 text-sm">No categories yet</p>
              ) : (
                categories.map((cat, i) => (
                  <motion.div key={cat.id} initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.1 }} className="min-w-[130px]">
                    <Link href={`/category/${cat.slug}`}>
                      <motion.div {...cardHover} className="bg-white dark:bg-gray-800 p-3 rounded-xl text-center shadow border border-gray-100 dark:border-gray-700 cursor-pointer">
                        <div className="relative w-full h-24 rounded-lg overflow-hidden mb-2 bg-gradient-to-br from-purple-100 to-teal-100">
                          <SafeImage
                            src={cat.image?.startsWith("http") ? cat.image : null}
                            alt={cat.title}
                            fill
                            sizes="130px"
                            className="object-cover"
                          />
                        </div>
                        <p className="text-xs font-bold text-gray-900 dark:text-white">{cat.title}</p>
                      </motion.div>
                    </Link>
                  </motion.div>
                ))
              )}
            </div>
          </motion.div>

          <div className="flex justify-center">
            <Link href="/categories">
              <motion.button whileHover={{ x: 4 }} className="flex items-center gap-2 text-gray-600 dark:text-gray-400 font-medium text-sm hover:underline">
                See All Categories <ArrowRight className="w-4 h-4" />
              </motion.button>
            </Link>
          </div>

          {/* FEATURED LISTINGS */}
          <motion.div {...fadeInUp}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Zap className="w-5 h-5 text-yellow-500" /> Popular Services
              </h3>
              <Link href="/categories" className="text-purple-600 dark:text-purple-400 text-sm font-medium">See All</Link>
            </div>
            <div className="flex space-x-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
              {listings.length === 0 ? (
                <p className="text-gray-400 text-sm">No listings yet</p>
              ) : (
                listings.slice(0, 6).map((listing, i) => (
                  <motion.div key={listing.id} initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.1 }}>
                    <Link href={`/category/${listing.category?.slug || listing.category}`}>
                      <motion.div {...cardHover} className="bg-white dark:bg-gray-800 p-3 rounded-xl min-w-[155px] shadow border border-gray-100 dark:border-gray-700 relative cursor-pointer">
                        <div className="relative w-full h-28 rounded-lg overflow-hidden mb-2 bg-gradient-to-br from-purple-100 to-teal-100">
                          <SafeImage
                            src={listing.image?.startsWith("http") ? listing.image : null}
                            alt={listing.title}
                            fill
                            sizes="155px"
                            className="object-cover"
                          />
                        </div>
                        <motion.button onClick={(e) => {
                          e.preventDefault(); e.stopPropagation();
                          const item = { id: listing.id, title: listing.title, price: listing.price, img: listing.image };
                          if (mounted && isInWishlist(listing.id)) { removeFromWishlist(listing.id); showToast("Removed from Wishlist!"); }
                          else { addToWishlist(item); showToast("Added to Wishlist!"); }
                        }} className="absolute top-2 right-2 p-1.5 bg-white dark:bg-gray-700 rounded-full shadow">
                          <Heart className={`w-3.5 h-3.5 ${mounted && isInWishlist(listing.id) ? "fill-red-500 text-red-500" : "text-gray-400"}`} />
                        </motion.button>
                        <p className="text-sm font-bold text-gray-900 dark:text-white line-clamp-1">{listing.title}</p>
                        <p className="text-xs text-gray-500 mb-1">by @{listing.vendor?.username || listing.vendor}</p>
                        <p className="text-base font-black text-purple-600">₦{Number(listing.price).toLocaleString()}</p>
                      </motion.div>
                    </Link>
                  </motion.div>
                ))
              )}
            </div>
          </motion.div>

        </div>
      </div>
    </>
  );
}
