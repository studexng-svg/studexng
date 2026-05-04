"use client";

import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search, ChevronLeft, Sparkles, Heart, Star, MessageCircle, X,
  ChevronRight, ArrowRight, Shield,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useCartStore } from "@/lib/cartStore";
import { useAuth, fetchWithAuth } from "@/lib/authStore";
import { useWishlistStore } from "@/lib/wishlistStore";
import ChatWindow from "@/components/ChatWindow";
import { GRAD, SERIF } from "@/lib/tokens";

interface Listing {
  id: number;
  title: string;
  description: string;
  price: number;
  image: string;
  vendor: {
    id: number;
    username: string;
    business_name?: string;
    profile?: {
      vendor_badge: "none" | "rising" | "trusted" | "top";
      completion_rate: number;
      rating: number;
      total_reviews: number;
    };
  };
  category: { id: number; title: string };
  is_available: boolean;
  listing_type?: string;
}

interface ActiveChat {
  sellerId: number;
  sellerName: string;
  listingId: number;
  productName: string;
  originalPrice: number;
}

interface Props {
  slug: string;
  initialListings: Listing[];
}

const BADGE_LABELS: Record<string, string> = {
  top: "⭐ Top Vendor",
  trusted: "✓ Trusted",
  rising: "↑ Rising",
};

const BADGE_STYLES: Record<string, string> = {
  top: "bg-amber-50 text-amber-700 border border-amber-200",
  trusted: "bg-teal-50 text-teal-700 border border-teal-200",
  rising: "bg-purple-50 text-purple-700 border border-purple-200",
};

function SafeImage({ src, alt }: { src: string | null | undefined; alt: string }) {
  const [error, setError] = useState(false);
  if (!src || error || !src.startsWith("http")) {
    return (
      <div className="w-full h-full bg-gradient-to-br from-teal-50 to-purple-50 flex items-center justify-center">
        <Sparkles className="w-6 h-6 text-stone-300" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className="w-full h-full object-cover"
      onError={() => setError(true)}
    />
  );
}

function ListingSkeletons() {
  return (
    <div className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-4">
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="bg-white rounded-2xl border border-stone-100 overflow-hidden animate-pulse">
          <div className="w-full h-48 bg-stone-100" />
          <div className="px-4 pt-3 pb-4 space-y-2.5">
            <div className="h-4 bg-stone-100 rounded-full w-3/4" />
            <div className="h-3 bg-stone-100 rounded-full w-1/2" />
            <div className="flex justify-between items-center mt-2">
              <div className="h-7 bg-stone-100 rounded-full w-20" />
              <div className="h-9 bg-stone-100 rounded-full w-24" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function CategoryPageClient({ slug, initialListings }: Props) {
  const router = useRouter();
  const { addToCart } = useCartStore();
  const { isLoggedIn, user, isHydrated } = useAuth();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlistStore();

  const [mounted, setMounted] = useState(false);
  const [campusReady, setCampusReady] = useState(false);
  const [listings, setListings] = useState<Listing[]>(initialListings);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [activeChat, setActiveChat] = useState<ActiveChat | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{ src: string; title: string } | null>(null);

  const categoryName = slug.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxImage(null);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  // Hold listings behind a skeleton until campus is confirmed.
  // SSR may have fetched PAU listings; FUTO users need a refetch.
  useEffect(() => {
    if (!isHydrated) return;

    if (!isLoggedIn || !user) {
      setCampusReady(true);
      return;
    }

    const campus = ((user as any).school || 'pau').toLowerCase();
    const cookieCampus =
      document.cookie
        .split(';')
        .find(c => c.trim().startsWith('studex_campus='))
        ?.split('=')?.[1]
        ?.toLowerCase() || 'pau';

    if (cookieCampus === campus) {
      setCampusReady(true);
      return;
    }

    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
    document.cookie = `studex_campus=${campus}; path=/; max-age=31536000`;
    fetchWithAuth(`${API_URL}/api/services/listings/?category=${slug}&campus=${campus}`)
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setListings(data.results || data || []);
        }
      })
      .catch(() => {})
      .finally(() => setCampusReady(true));
  }, [isHydrated, isLoggedIn, (user as any)?.school, slug]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
  };

  const handleAddToCart = (listing: Listing) => {
    addToCart({ id: listing.id, title: listing.title, price: listing.price, img: listing.image });
    try { sessionStorage.setItem("cart-referrer", window.location.pathname); } catch {}
    showToast("Added to cart!");
  };

  const handleOpenChat = (listing: Listing) => {
    if (!isLoggedIn) { router.push("/auth"); return; }
    setActiveChat({
      sellerId: listing.vendor.id,
      sellerName: listing.vendor.business_name || listing.vendor.username,
      listingId: listing.id,
      productName: listing.title,
      originalPrice: listing.price,
    });
  };

  const filteredListings = listings.filter(l =>
    l.title.toLowerCase().includes(search.toLowerCase()) ||
    l.description.toLowerCase().includes(search.toLowerCase())
  );

  const BADGE_WEIGHT = { top: 3, trusted: 2, rising: 1, none: 0 };
  const sortedListings = [...filteredListings].sort((a, b) => {
    const aBadge = BADGE_WEIGHT[a.vendor.profile?.vendor_badge || 'none'];
    const bBadge = BADGE_WEIGHT[b.vendor.profile?.vendor_badge || 'none'];
    if (bBadge !== aBadge) return bBadge - aBadge;
    return (b.vendor.profile?.completion_rate || 0) - (a.vendor.profile?.completion_rate || 0);
  });

  return (
    <div className="min-h-screen bg-[#FAFAF9]" style={{ fontFamily: "'DM Sans', sans-serif" }}>

      {/* Toast */}
      {toast && (
        <motion.div
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 60, opacity: 1 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full shadow-lg z-50 font-medium text-sm text-white"
          style={{ background: GRAD }}>
          {toast}
        </motion.div>
      )}

      {/* Chat window */}
      {activeChat && (
        <ChatWindow
          sellerId={activeChat.sellerId}
          sellerName={activeChat.sellerName}
          listingId={activeChat.listingId}
          productName={activeChat.productName}
          originalPrice={activeChat.originalPrice}
          onClose={() => setActiveChat(null)}
        />
      )}

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightboxImage(null)}
            className="fixed inset-0 bg-black/95 z-[9999] flex items-center justify-center p-4">
            <button
              onClick={() => setLightboxImage(null)}
              className="absolute top-4 right-4 z-10 bg-white/10 hover:bg-white/20 text-white rounded-full p-3 transition">
              <X className="w-6 h-6" />
            </button>
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
              className="relative w-full max-w-3xl"
              style={{ maxHeight: "90dvh" }}>
              <img
                src={lightboxImage.src}
                alt={lightboxImage.title}
                className="w-full h-auto rounded-2xl object-contain"
                style={{ maxHeight: "85dvh" }}
              />
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent rounded-b-2xl p-4">
                <p className="text-white font-bold text-center">{lightboxImage.title}</p>
                <p className="text-white/60 text-xs text-center mt-0.5">Tap outside to close</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── STICKY HEADER ── */}
      <div className="sticky top-0 bg-white/80 backdrop-blur-md z-40 border-b border-stone-100 shadow-sm">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-3 px-4 py-3">
            <button
              onClick={() => router.back()}
              className="p-2 hover:bg-stone-100 rounded-full transition flex-shrink-0 active:scale-95">
              <ChevronLeft className="w-5 h-5 text-stone-600" />
            </button>

            {/* Category title — desktop only */}
            <span
              className="hidden lg:block font-black italic tracking-tighter uppercase text-stone-900 text-lg flex-shrink-0"
              style={{ fontFamily: "var(--font-jakarta), 'Plus Jakarta Sans', sans-serif" }}>
              {categoryName}
            </span>

            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
              <input
                type="text"
                placeholder={`Search ${categoryName.toLowerCase()}...`}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-stone-50 border border-stone-200 rounded-full text-sm focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100 transition"
              />
            </div>

            {!isLoggedIn && (
              <Link href="/auth" className="hidden lg:block flex-shrink-0">
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="px-4 py-2 text-white font-medium rounded-full text-sm shadow-sm"
                  style={{ background: GRAD }}>
                  Login
                </motion.button>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div className="max-w-6xl mx-auto px-4 pt-6 pb-32">
        <div className="lg:grid lg:grid-cols-[1fr_300px] lg:gap-10 lg:items-start">

          {/* ── LEFT / MAIN COLUMN ── */}
          <div>
            {/* Section heading */}
            <div className="flex items-end justify-between mb-4">
              <div>
                <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-bold">Available Now</p>
                <h1
                  className="text-2xl font-black italic tracking-tighter uppercase text-stone-900 mt-0.5"
                  style={{ fontFamily: "var(--font-jakarta), 'Plus Jakarta Sans', sans-serif" }}>
                  {categoryName}
                </h1>
              </div>
              {campusReady && sortedListings.length > 0 && (
                <span className="text-stone-400 text-sm font-medium pb-0.5">
                  {sortedListings.length} listing{sortedListings.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {/* Listings */}
            {mounted && !campusReady ? (
              <ListingSkeletons />
            ) : sortedListings.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl p-12 text-center border border-stone-100 shadow-sm">
                <Sparkles className="w-12 h-12 text-stone-200 mx-auto mb-3" />
                <h3 className="text-lg font-bold text-stone-400" style={SERIF}>
                  {search ? "No results found" : "No listings yet"}
                </h3>
                <p className="text-stone-400 text-sm mt-1">
                  {search
                    ? `No ${categoryName.toLowerCase()} listings match "${search}"`
                    : `No ${categoryName.toLowerCase()} listings available yet. Check back soon!`}
                </p>
                <Link href="/categories">
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    className="mt-6 px-6 py-2.5 text-white rounded-full font-semibold text-sm inline-flex items-center gap-1.5"
                    style={{ background: GRAD }}>
                    Browse all categories <ChevronRight className="w-4 h-4" />
                  </motion.button>
                </Link>
              </motion.div>
            ) : (
              <div className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-4">
                {sortedListings.map((listing, i) => {
                  const badge = listing.vendor.profile?.vendor_badge;
                  const rating = listing.vendor.profile?.rating;
                  const totalReviews = listing.vendor.profile?.total_reviews;
                  const isService = (listing.listing_type || "").toLowerCase() === "service";
                  const isOwnListing = !!(user?.id && user.id === listing.vendor.id);
                  const wishlisted = mounted && isInWishlist(listing.id);
                  const imageUrl = listing.image?.startsWith("http") ? listing.image : null;

                  return (
                    <motion.div
                      key={listing.id}
                      initial={{ opacity: 0, y: 16 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: Math.min(i * 0.05, 0.25) }}
                      className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden">

                      {/* Clickable image + description → listing detail */}
                      <Link href={`/listing/${listing.id}`} className="block">

                        {/* Image */}
                        <div
                          className="relative w-full h-48 overflow-hidden cursor-pointer"
                          onClick={(e) => {
                            if (imageUrl) {
                              e.preventDefault();
                              setLightboxImage({ src: imageUrl, title: listing.title });
                            }
                          }}>
                          <SafeImage src={imageUrl} alt={listing.title} />

                          {!listing.is_available && (
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                              <span className="text-white font-bold bg-red-500 px-3 py-1 rounded-full text-xs">
                                Unavailable
                              </span>
                            </div>
                          )}

                          {badge && badge !== "none" && (
                            <div className="absolute top-3 left-3">
                              <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full backdrop-blur-sm ${BADGE_STYLES[badge]}`}>
                                {BADGE_LABELS[badge]}
                              </span>
                            </div>
                          )}

                          {/* Heart — wishlist */}
                          <motion.button
                            onClick={(e) => {
                              e.preventDefault(); e.stopPropagation();
                              const item = { id: listing.id, title: listing.title, price: listing.price, img: listing.image };
                              if (wishlisted) { removeFromWishlist(listing.id); showToast("Removed from Wishlist"); }
                              else { addToWishlist(item); showToast("Added to Wishlist"); }
                            }}
                            whileTap={{ scale: 0.85 }}
                            className="absolute top-3 right-3 w-8 h-8 bg-white/90 backdrop-blur-sm rounded-full shadow flex items-center justify-center z-10">
                            <Heart className={`w-4 h-4 transition-colors ${wishlisted ? "fill-red-500 text-red-500" : "text-stone-400"}`} />
                          </motion.button>

                          {/* Title + vendor overlay */}
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent pt-8 pb-3 px-4">
                            <p className="text-white font-bold text-base leading-tight line-clamp-1">{listing.title}</p>
                            <p className="text-white/75 text-xs mt-0.5">
                              @{listing.vendor.business_name || listing.vendor.username}
                            </p>
                          </div>
                        </div>

                        {/* Description */}
                        <div className="px-4 pt-3 pb-1">
                          {(totalReviews ?? 0) > 0 && (
                            <div className="flex items-center gap-1 mb-1.5">
                              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                              <span className="text-xs text-stone-500 font-medium">{rating}</span>
                              <span className="text-xs text-stone-400">({totalReviews})</span>
                            </div>
                          )}
                          <p className="text-sm text-stone-500 line-clamp-2 leading-relaxed">
                            {listing.description || "Tap to view details."}
                          </p>
                        </div>

                      </Link>

                      {/* Price + action */}
                      <div className="px-4 py-3 flex items-center justify-between">
                        <div>
                          <p className="text-xs text-stone-400 font-medium">Price</p>
                          <p className="text-xl font-bold text-stone-900">
                            ₦{Number(listing.price).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {!isOwnListing && (
                            <motion.button
                              whileTap={{ scale: 0.95 }}
                              onClick={() => handleOpenChat(listing)}
                              className="w-9 h-9 bg-stone-100 text-stone-500 rounded-full flex items-center justify-center hover:bg-teal-50 hover:text-teal-600 transition"
                              title="Message vendor">
                              <MessageCircle className="w-4 h-4" />
                            </motion.button>
                          )}
                          {isOwnListing ? (
                            <Link href="/seller/listings">
                              <motion.button
                                whileHover={{ scale: 1.04 }}
                                whileTap={{ scale: 0.96 }}
                                className="px-6 py-2.5 text-white rounded-full font-black text-sm shadow-sm uppercase tracking-wide transition-opacity hover:opacity-90"
                                style={{ background: GRAD }}>
                                Manage
                              </motion.button>
                            </Link>
                          ) : listing.is_available && !isService ? (
                            <motion.button
                              whileHover={{ scale: 1.04 }}
                              whileTap={{ scale: 0.96 }}
                              onClick={() => handleAddToCart(listing)}
                              className="px-6 py-2.5 text-white rounded-full font-black text-sm shadow-sm uppercase tracking-wide transition-opacity hover:opacity-90"
                              style={{ background: GRAD }}>
                              Order
                            </motion.button>
                          ) : (
                            <Link href={`/listing/${listing.id}`}>
                              <motion.button
                                whileHover={{ scale: 1.04 }}
                                whileTap={{ scale: 0.96 }}
                                className="px-6 py-2.5 text-white rounded-full font-black text-sm shadow-sm uppercase tracking-wide transition-opacity hover:opacity-90"
                                style={{ background: GRAD }}>
                                {listing.is_available ? "Book" : "View"}
                              </motion.button>
                            </Link>
                          )}
                        </div>
                      </div>

                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── RIGHT SIDEBAR (desktop only) ── */}
          <div className="hidden lg:flex flex-col gap-5 sticky" style={{ top: "80px" }}>

            {/* Category info card */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
              <div
                className="h-24 flex items-center justify-center relative"
                style={{ background: GRAD }}>
                <div className="absolute inset-0 bg-white/10 blur-2xl" />
                <h2
                  className="relative text-white font-black italic tracking-tighter uppercase text-2xl text-center px-4"
                  style={{ fontFamily: "var(--font-jakarta), 'Plus Jakarta Sans', sans-serif" }}>
                  {categoryName}
                </h2>
              </div>
              <div className="p-4">
                {campusReady ? (
                  <p className="text-stone-500 text-sm text-center">
                    {sortedListings.length > 0
                      ? <><span className="font-bold text-stone-900">{sortedListings.length}</span> listing{sortedListings.length !== 1 ? 's' : ''} available</>
                      : "No listings available yet"}
                  </p>
                ) : (
                  <div className="h-4 bg-stone-100 rounded-full w-2/3 mx-auto animate-pulse" />
                )}
                <Link href="/categories">
                  <motion.div
                    whileHover={{ x: 3 }}
                    className="mt-3 flex items-center justify-center gap-1 text-teal-600 text-sm font-semibold cursor-pointer">
                    Browse all categories <ChevronRight className="w-4 h-4" />
                  </motion.div>
                </Link>
              </div>
            </motion.div>

            {/* Guest CTA */}
            {!isLoggedIn && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="bg-white border border-stone-200 rounded-2xl p-6 text-center shadow-sm">
                <Shield className="w-8 h-8 mx-auto mb-3 text-teal-600" />
                <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-bold mb-1">Safe & Secure</p>
                <h3
                  className="text-xl font-black italic tracking-tighter uppercase text-stone-900 mb-1"
                  style={{ fontFamily: "var(--font-jakarta), 'Plus Jakarta Sans', sans-serif" }}>
                  Ready to book?
                </h3>
                <p className="text-stone-400 text-sm mb-4">Create a free account to book any service.</p>
                <Link href="/auth">
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    className="w-full py-3 text-white font-semibold rounded-full text-sm shadow-lg shadow-teal-200/60 inline-flex items-center justify-center gap-2"
                    style={{ background: GRAD }}>
                    Create Account <ArrowRight className="w-4 h-4" />
                  </motion.button>
                </Link>
              </motion.div>
            )}

          </div>

        </div>
      </div>
    </div>
  );
}
