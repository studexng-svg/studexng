"use client";

import { useEffect, useState, Suspense, useRef } from "react";
import { Search, ArrowRight, Heart, X, Sparkles, Star, MapPin, Shield, ChevronRight, Clock, Plus } from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth, fetchWithAuth } from "@/lib/authStore";
import { useWishlistStore } from "@/lib/wishlistStore";
import { useCart } from "@/lib/cartStore";
import { GRAD, GRAD_TEXT, SERIF } from "@/lib/tokens";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

interface Vendor {
  id: number;
  username: string;
  business_name: string;
  profile_picture: string | null;
  vendor_badge: "top" | "trusted" | "rising" | "none";
  rating: number;
  total_reviews: number;
  completion_rate: number;
  total_listings: number;
  hostel: string;
}

function SafeImage({ src, alt, className }: {
  src: string | null | undefined;
  alt: string;
  className?: string;
}) {
  const [error, setError] = useState(false);
  if (!src || error || !src.startsWith("http")) {
    return (
      <div className={`w-full h-full bg-gradient-to-br from-teal-50 to-purple-50 flex items-center justify-center ${className || ""}`}>
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
      className={`w-full h-full object-cover ${className || ""}`}
      onError={() => setError(true)}
    />
  );
}

function VendorAvatar({ src, name }: { src: string | null; name: string }) {
  const [error, setError] = useState(false);
  const initials = (name || "??").slice(0, 2).toUpperCase();
  const resolvedSrc = src
    ? src.startsWith("http")
      ? src
      : `${API_URL}${src}`
    : null;
  if (!resolvedSrc || error) {
    return (
      <div className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
        style={{ background: GRAD }}>
        {initials}
      </div>
    );
  }
  return (
    <div className="w-16 h-16 rounded-full overflow-hidden flex-shrink-0">
      <img src={resolvedSrc} alt={name} className="w-full h-full object-cover block" onError={() => setError(true)} />
    </div>
  );
}

const BADGE_LABELS: Record<string, string> = {
  top: "⭐ Top Vendor",
  trusted: "✓ Trusted",
  rising: "↑ Rising",
};

function ListingSkeletons() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:gap-4">
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="bg-white rounded-2xl border border-stone-100 overflow-hidden animate-pulse">
          <div className="w-full h-40 sm:h-44 lg:h-48 bg-stone-100" />
          <div className="px-2.5 pt-2 pb-3 sm:px-4 sm:pt-3 sm:pb-4 space-y-2">
            <div className="h-3 bg-stone-100 rounded-full w-3/4" />
            <div className="h-2.5 bg-stone-100 rounded-full w-1/2" />
            <div className="flex justify-between items-center mt-1.5">
              <div className="h-5 sm:h-7 bg-stone-100 rounded-full w-14 sm:w-20" />
              <div className="h-7 sm:h-9 bg-stone-100 rounded-full w-16 sm:w-24" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

const BADGE_STYLES: Record<string, string> = {
  top: "bg-amber-50 text-amber-700 border border-amber-200",
  trusted: "bg-teal-50 text-teal-700 border border-teal-200",
  rising: "bg-purple-50 text-purple-700 border border-purple-200",
};

interface Props {
  initialVendors: Vendor[];
  initialListings: any[];
}

export default function HomePageClient({ initialVendors, initialListings }: Props) {
  const { isLoggedIn, user, isHydrated } = useAuth();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlistStore();
  const { addToCart, cart } = useCart();

  const [mounted, setMounted] = useState(false);
  const [campusReady, setCampusReady] = useState(false);
  const [toast, setToast] = useState("");

  const [vendors, setVendors] = useState<Vendor[]>(initialVendors);
  const [allListings, setAllListings] = useState<any[]>(initialListings);
  const [listings, setListings] = useState<any[]>(initialListings);
  const [activeFilter, setActiveFilter] = useState("All");

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => setMounted(true), []);

  // Confirm campus filter before showing any listings.
  // SSR uses the studex_campus cookie; if stale/missing, the data is wrong for FUTO users.
  // We hold listings behind a skeleton until we've verified (or corrected) the campus.
  useEffect(() => {
    if (!isHydrated) return;

    if (!isLoggedIn || !user) {
      // Not logged in — SSR data is fine (no personal campus to enforce)
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
      // Cookie already matches — SSR fetched the right campus
      setCampusReady(true);
      return;
    }

    // Campus mismatch: update cookie and refetch with the correct campus
    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
    document.cookie = `studex_campus=${campus}; path=/; max-age=31536000; SameSite=Lax${isHttps ? '; Secure' : ''}`;
    Promise.all([
      fetchWithAuth(`${API_URL}/api/services/listings/?campus=${campus}`),
      fetchWithAuth(`${API_URL}/api/auth/vendors/?campus=${campus}`),
    ])
      .then(async ([listRes, vendorRes]) => {
        if (listRes.ok) {
          const d = await listRes.json();
          const f = d.results || d || [];
          setAllListings(f);
          setListings(f);
          setActiveFilter("All");
        }
        if (vendorRes.ok) {
          const d = await vendorRes.json();
          setVendors(d.results || d || []);
        }
      })
      .catch(() => {})
      .finally(() => setCampusReady(true));
  }, [isHydrated, isLoggedIn, (user as any)?.school]);

  const listingsSectionRef = useRef<HTMLDivElement>(null);

  const filters = ["All", "Services"];
  const handleFilter = (filter: string) => {
    setActiveFilter(filter);
    if (filter === "All") { setListings(allListings); return; }
    const filtered = allListings.filter(l => {
      const type = (l.listing_type || "").toLowerCase();
      if (filter === "Services") return type === "service";
      if (filter === "Products") return type === "product";
      return true;
    });
    setListings(filtered);
    setTimeout(() => {
      listingsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); setShowResults(false); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const url = `${API_URL}/api/services/listings/?search=${encodeURIComponent(searchQuery)}`;
        const res = isLoggedIn
          ? await fetchWithAuth(url)
          : await fetch(url);
        const data = await res.json();
        setSearchResults(data.results || data || []);
        setShowResults(true);
      } catch { setSearchResults([]); }
      finally { setSearching(false); }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery, isLoggedIn]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
  };

  const [shuffledListings, setShuffledListings] = useState<any[]>(initialListings);

  useEffect(() => {
    const arr = [...listings];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    setShuffledListings(arr);
  }, [listings]);

  const featuredListings = shuffledListings;

  return (
    <>
      {toast && (
        <motion.div initial={{ y: -50, opacity: 0 }} animate={{ y: 60, opacity: 1 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full shadow-lg z-50 font-medium text-sm text-white"
          style={{ background: GRAD }}>
          {toast}
        </motion.div>
      )}

      <div className="min-h-screen bg-[#FAFAF9]" style={{ fontFamily: "'DM Sans', sans-serif" }}>

        {/* ── STICKY HEADER ── */}
        <div className="sticky top-0 bg-white/80 backdrop-blur-md z-40 border-b border-stone-100 shadow-sm">
          <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between px-4 py-3 gap-3">
            <Link href="/home" className="flex items-center gap-2 flex-shrink-0">
              <div className="w-9 h-9 rounded-full bg-white border border-stone-200 flex items-center justify-center p-1 shadow-sm overflow-hidden flex-shrink-0">
                <img src="/images/logo-1.jpg" alt="StudEx" loading="lazy" className="w-full h-full object-contain" />
              </div>
              <span className="font-bold text-lg text-stone-900" style={SERIF}>
                Stud<span style={GRAD_TEXT}>Ex</span>
              </span>
            </Link>

            <div className="relative flex-1 max-w-xs">
              <Search className="w-4 h-4 absolute left-3 top-3 text-stone-400 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onFocus={() => searchResults.length > 0 && setShowResults(true)}
                onBlur={() => setTimeout(() => setShowResults(false), 200)}
                placeholder="Search services..."
                className="w-full pl-9 pr-8 py-2.5 bg-stone-50 text-stone-900 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 border border-stone-200 placeholder:text-stone-400 transition-all"
              />
              {searchQuery && (
                <button onClick={() => { setSearchQuery(""); setShowResults(false); }}
                  className="absolute right-3 top-3 text-stone-400 hover:text-stone-600">
                  <X className="w-4 h-4" />
                </button>
              )}
              <AnimatePresence>
                {showResults && (
                  <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="absolute top-full mt-2 left-0 right-0 bg-white rounded-2xl shadow-xl border border-stone-100 z-50 overflow-hidden max-h-72 overflow-y-auto">
                    {searching ? (
                      <div className="p-4 text-center text-stone-400 text-sm">Searching...</div>
                    ) : searchResults.length === 0 ? (
                      <div className="p-4 text-center text-stone-400 text-sm">No results for "{searchQuery}"</div>
                    ) : (
                      searchResults.map(item => (
                        <Link key={item.id} href={`/listing/${item.id}`}
                          onClick={() => { setShowResults(false); setSearchQuery(""); }}>
                          <div className="flex items-center gap-3 p-3 hover:bg-stone-50 transition border-b border-stone-50 last:border-0 cursor-pointer">
                            <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0">
                              <SafeImage src={item.image?.startsWith("http") ? item.image : null} alt={item.title} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-stone-900 text-sm truncate">{item.title}</p>
                              <p className="text-xs text-stone-400">@{item.vendor?.username || item.vendor}</p>
                            </div>
                            <p className="font-bold text-sm flex-shrink-0" style={GRAD_TEXT}>₦{Number(item.price).toLocaleString()}</p>
                          </div>
                        </Link>
                      ))
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {!isLoggedIn && (
              <Link href="/auth">
                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  className="px-4 py-2 text-white font-medium rounded-full text-sm shadow-sm flex-shrink-0"
                  style={{ background: GRAD }}>
                  Login
                </motion.button>
              </Link>
            )}
          </div>

          {/* Filter tabs */}
          <div className="flex gap-2 px-4 pb-3 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {filters.map(filter => (
              <button key={filter} onClick={() => handleFilter(filter)}
                className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  activeFilter === filter ? "text-white shadow-sm" : "bg-stone-100 text-stone-500 hover:bg-stone-200"
                }`}
                style={activeFilter === filter ? { background: GRAD } : {}}>
                {filter}
              </button>
            ))}
          </div>
          </div>
        </div>

        <div className="px-4 pt-6 pb-32 max-w-6xl mx-auto">
          <div className="lg:grid lg:grid-cols-[1fr_300px] lg:gap-10 lg:items-start">

          {/* ── LEFT / MAIN COLUMN ── */}
          <div className="space-y-8">

          {/* ── GREETING ── */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            {isLoggedIn && user ? (
              <>
                <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-bold">Welcome back</p>
                <h1 className="text-3xl font-black italic tracking-tighter uppercase text-stone-900 mt-1"
                  style={{ fontFamily: "var(--font-jakarta), 'Plus Jakarta Sans', sans-serif" }}>
                  Hey, {user.username || "there"} 👋
                </h1>
                <p className="text-stone-400 text-sm mt-1">Here's what's available on campus today.</p>
              </>
            ) : (
              <>
                <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-bold">Campus Marketplace</p>
                <h1 className="text-3xl font-black italic tracking-tighter uppercase text-stone-900 mt-1"
                  style={{ fontFamily: "var(--font-jakarta), 'Plus Jakarta Sans', sans-serif" }}>
                  Discover Services
                </h1>
                <p className="text-stone-400 text-sm mt-1">Browse verified vendors on campus.</p>
              </>
            )}
          </motion.div>

          {/* ── HERO BANNER ── */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Link href="/categories">
              <motion.div whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }}
                className="relative rounded-2xl overflow-hidden h-36 cursor-pointer shadow-md bg-gradient-to-br from-teal-500 to-purple-600">
                <div className="absolute top-0 right-0 w-48 h-48 rounded-full bg-white/10 blur-3xl pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-40 h-40 rounded-full bg-white/10 blur-3xl pointer-events-none" />
                <div className="relative z-10 h-full flex flex-col justify-center px-6">
                  <p className="text-white/80 text-xs tracking-[0.25em] uppercase font-semibold mb-1">Campus Marketplace</p>
                  <h2 className="text-xl font-bold text-white" style={SERIF}>
                    Every service,{" "}
                    <span className="italic" style={{
                      background: "linear-gradient(135deg, #2dd4bf 0%, #a78bfa 100%)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                    }}>one tap away.</span>
                  </h2>
                  <p className="text-white/70 text-xs mt-2 flex items-center gap-1">
                    Browse all categories <ChevronRight className="w-3 h-3" />
                  </p>
                </div>
              </motion.div>
            </Link>
          </motion.div>

          {/* ── VENDORS ROW — mobile only ── */}
          <div className="lg:hidden">
          <Suspense fallback={<div className="h-20 bg-stone-100 rounded-2xl animate-pulse" />}>
          {vendors.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-bold">On Campus</p>
                  <h2 className="text-2xl font-black italic tracking-tighter uppercase text-stone-900 mt-0.5"
                    style={{ fontFamily: "var(--font-jakarta), 'Plus Jakarta Sans', sans-serif" }}>
                    Vendors
                  </h2>
                </div>
              </div>

              <div className="flex gap-4 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
                {vendors.map((vendor, i) => (
                  <motion.div
                    key={vendor.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.06 }}
                    className="flex-shrink-0 flex flex-col items-center gap-2 w-20">
                    <Link href={`/vendor/${vendor.username}`}>
                      <motion.div whileTap={{ scale: 0.95 }} className="relative cursor-pointer">
                        <div style={{
                          borderRadius: '50%',
                          padding: '3px',
                          background: 'linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                          <div style={{
                            borderRadius: '50%',
                            padding: '2px',
                            background: '#FAFAF9',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}>
                            <VendorAvatar src={vendor.username === user?.username && user?.profile_image ? user.profile_image : vendor.profile_picture} name={vendor.business_name || vendor.username} />
                          </div>
                        </div>
                        {vendor.vendor_badge && vendor.vendor_badge !== "none" && (
                          <div className={`absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full border-2 border-white flex items-center justify-center text-[8px] font-bold
                            ${vendor.vendor_badge === "top" ? "bg-amber-400" : vendor.vendor_badge === "trusted" ? "bg-teal-500" : "bg-purple-500"}`}>
                            {vendor.vendor_badge === "top" ? "⭐" : vendor.vendor_badge === "trusted" ? "✓" : "↑"}
                          </div>
                        )}
                      </motion.div>
                    </Link>
                    <p className="text-xs text-stone-700 font-medium text-center leading-tight line-clamp-2 w-full">
                      {vendor.business_name || vendor.username}
                    </p>
                    {vendor.total_reviews > 0 && (
                      <div className="flex items-center gap-0.5">
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                        <span className="text-xs text-stone-400">{vendor.rating}</span>
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
          </Suspense>
          </div>

          {/* ── FEATURED LISTINGS ── */}
          <Suspense fallback={<div className="h-40 bg-stone-100 rounded-2xl animate-pulse" />}>
          <motion.div ref={listingsSectionRef} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-bold">Available Now</p>
                <h2 className="text-2xl font-black italic tracking-tighter uppercase text-stone-900 mt-0.5"
                  style={{ fontFamily: "var(--font-jakarta), 'Plus Jakarta Sans', sans-serif" }}>
                  {activeFilter === "All" ? "Featured Services" : activeFilter}
                </h2>
              </div>
              <Link href="/categories">
                <motion.button whileHover={{ x: 3 }} className="flex items-center gap-1 text-stone-400 text-sm font-medium hover:text-teal-600 transition">
                  See all <ChevronRight className="w-4 h-4" />
                </motion.button>
              </Link>
            </div>

            {mounted && !campusReady ? (
              <ListingSkeletons />
            ) : featuredListings.length === 0 ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="bg-white rounded-2xl p-12 text-center border border-stone-100 shadow-sm">
                <Sparkles className="w-12 h-12 text-stone-200 mx-auto mb-3" />
                <h3 className="text-lg font-bold text-stone-400" style={SERIF}>
                  No listings yet
                </h3>
                <p className="text-stone-400 text-sm mt-1">Check back soon!</p>
              </motion.div>
            ) : (
              <>
                {/* ── Vertical card list ── */}
                <div className="grid grid-cols-2 gap-3 lg:gap-4">
                  {featuredListings.map((listing, i) => {
                    const badge = listing.vendor?.profile?.vendor_badge;
                    const rating = listing.vendor?.profile?.rating;
                    const totalReviews = listing.vendor?.profile?.total_reviews;
                    const wishlisted = mounted && isInWishlist(listing.id);
                    const isService = (listing.listing_type || "").toLowerCase() === "service";
                    const isOwnListing = !!(user?.id && user.id === listing.vendor?.id);
                    const isReserved = !isService && !isOwnListing && !!listing.is_reserved;
                    const inCart = cart.some((i) => i.id === listing.id);

                    return (
                      <motion.div
                        key={listing.id}
                        initial={{ opacity: 0, y: 16 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: Math.min(i * 0.05, 0.25) }}
                        className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden">

                        {/* ── Clickable card body (image + description) ── */}
                        <Link href={`/listing/${listing.id}`} className="block">

                        {/* ── Image with overlays ── */}
                        <div className="relative w-full h-40 sm:h-44 lg:h-48 overflow-hidden">
                          <SafeImage
                            src={listing.image?.startsWith("http") ? listing.image : null}
                            alt={listing.title}
                            className="object-cover"
                          />

                          {/* Unavailable overlay */}
                          {!listing.is_available && (
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                              <span className="text-white font-bold bg-red-500 px-3 py-1 rounded-full text-xs">Unavailable</span>
                            </div>
                          )}

                          {/* Badge pill — top-left */}
                          {badge && badge !== "none" && (
                            <div className="absolute top-2 left-2">
                              <span className={`text-[8px] sm:text-[9px] font-semibold px-1.5 sm:px-2 py-0.5 rounded-full backdrop-blur-sm ${BADGE_STYLES[badge]}`}>
                                {BADGE_LABELS[badge]}
                              </span>
                            </div>
                          )}

                          {/* Heart — top-right */}
                          <motion.button
                            onClick={(e) => {
                              e.preventDefault(); e.stopPropagation();
                              const item = { id: listing.id, title: listing.title, price: listing.price, img: listing.image };
                              if (wishlisted) { removeFromWishlist(listing.id); showToast("Removed from Wishlist"); }
                              else { addToWishlist(item); showToast("Added to Wishlist ❤️"); }
                            }}
                            whileTap={{ scale: 0.85 }}
                            className="absolute top-2 right-2 w-7 h-7 sm:top-3 sm:right-3 sm:w-8 sm:h-8 bg-white/90 backdrop-blur-sm rounded-full shadow flex items-center justify-center z-10">
                            <Heart className={`w-3.5 h-3.5 sm:w-4 sm:h-4 transition-colors ${wishlisted ? "fill-red-500 text-red-500" : "text-stone-400"}`} />
                          </motion.button>

                          {/* Add to cart — bottom-right */}
                          {!isOwnListing && (
                            <motion.button
                              onClick={(e) => {
                                e.preventDefault(); e.stopPropagation();
                                addToCart({ id: listing.id, title: listing.title, price: listing.price, img: listing.image || "" });
                                showToast(inCart ? "Cart updated" : "Added to cart");
                              }}
                              whileTap={{ scale: 0.85 }}
                              className="absolute bottom-2 right-2 w-7 h-7 sm:bottom-3 sm:right-3 sm:w-8 sm:h-8 rounded-full shadow-lg flex items-center justify-center z-10 transition-opacity hover:opacity-90"
                              style={{ background: GRAD }}>
                              <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                            </motion.button>
                          )}

                          {/* Title + vendor gradient overlay — bottom of image */}
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent pt-6 pb-2 px-2.5 sm:pt-8 sm:pb-3 sm:px-4">
                            <p className="text-white font-bold text-xs sm:text-base leading-tight line-clamp-1">{listing.title}</p>
                            <p className="text-white/75 text-[10px] sm:text-xs mt-0.5 line-clamp-1">@{listing.vendor?.username || listing.vendor}</p>
                          </div>
                        </div>

                        {/* ── Description ── */}
                        <div className="px-2.5 pt-2 pb-0.5 sm:px-4 sm:pt-3 sm:pb-1">
                          {totalReviews > 0 && (
                            <div className="flex items-center gap-0.5 sm:gap-1 mb-1 sm:mb-1.5">
                              <Star className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-amber-400 text-amber-400" />
                              <span className="text-[10px] sm:text-xs text-stone-500 font-medium">{rating}</span>
                              <span className="text-[10px] sm:text-xs text-stone-400">({totalReviews})</span>
                            </div>
                          )}
                          <p className="text-[11px] sm:text-sm text-stone-500 line-clamp-2 leading-relaxed">
                            {listing.description || "Tap to view details."}
                          </p>
                        </div>

                        </Link>

                        {/* ── Price + Book / Order / Manage ── */}
                        <div className="px-2.5 py-2 sm:px-4 sm:py-3 flex items-center justify-between gap-1">
                          <div className="min-w-0">
                            <p className="text-[10px] sm:text-xs text-stone-400 font-medium">Price</p>
                            <p className="text-sm sm:text-xl font-bold text-stone-900 truncate">
                              ₦{Number(listing.price).toLocaleString()}
                            </p>
                          </div>
                          {isReserved ? (
                            <div className="flex items-center gap-1 px-2 py-1.5 sm:px-4 sm:py-2.5 bg-stone-100 border border-stone-200 rounded-full text-stone-400 font-semibold text-[10px] sm:text-xs uppercase tracking-wide cursor-not-allowed select-none shrink-0">
                              <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> Reserved
                            </div>
                          ) : (
                            <Link href={isOwnListing ? "/seller/listings" : `/listing/${listing.id}`} className="shrink-0">
                              <motion.button
                                whileHover={{ scale: 1.04 }}
                                whileTap={{ scale: 0.96 }}
                                className="px-3 py-2 sm:px-6 sm:py-2.5 text-white rounded-full font-black text-[11px] sm:text-sm shadow-sm uppercase tracking-wide transition-opacity hover:opacity-90"
                                style={{ background: GRAD }}>
                                {isOwnListing ? "Manage" : isService ? "Book" : "Order"}
                              </motion.button>
                            </Link>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

              </>
            )}
          </motion.div>
          </Suspense>

          {/* ── BOTTOM CTA (logged out, mobile only) ── */}
          {!isLoggedIn && (
            <div className="lg:hidden">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              className="bg-white border border-stone-200 rounded-2xl p-6 text-center shadow-sm relative overflow-hidden">
              <div className="relative z-10">
                <Shield className="w-8 h-8 mx-auto mb-3 text-teal-600" />
                <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-bold mb-1">Safe & Secure</p>
                <h3 className="text-2xl font-black italic tracking-tighter uppercase text-stone-900 mb-1"
                  style={{ fontFamily: "var(--font-jakarta), 'Plus Jakarta Sans', sans-serif" }}>
                  Ready to book?
                </h3>
                <p className="text-stone-400 text-sm mb-5">Create a free account to book any service.</p>
                <Link href="/auth">
                  <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                    className="px-8 py-3 text-white font-semibold rounded-full text-sm shadow-lg shadow-teal-200/60 inline-flex items-center gap-2"
                    style={{ background: GRAD }}>
                    Create Account <ArrowRight className="w-4 h-4" />
                  </motion.button>
                </Link>
              </div>
            </motion.div>
            </div>
          )}

          </div>{/* end left column */}

          {/* ── RIGHT SIDEBAR (desktop only) ── */}
          <div className="hidden lg:flex flex-col gap-6 sticky" style={{ top: "130px" }}>

            {/* Vendors vertical list */}
            {vendors.length > 0 && (
              <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5" style={{ marginTop: "3rem" }}>
                <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-bold mb-1">On Campus</p>
                <h2 className="text-xl font-black italic tracking-tighter uppercase text-stone-900 mb-4"
                  style={{ fontFamily: "var(--font-jakarta), 'Plus Jakarta Sans', sans-serif" }}>
                  Vendors
                </h2>
                <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1" style={{ scrollbarWidth: "thin", scrollbarColor: "#d1d5db transparent" }}>
                  {vendors.map(vendor => (
                    <Link key={vendor.id} href={`/vendor/${vendor.username}`}>
                      <div className="flex items-center gap-3 hover:bg-stone-50 rounded-xl p-2 transition cursor-pointer">
                        <div className="relative flex-shrink-0">
                          <div style={{ borderRadius: "50%", padding: "3px", background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <div style={{ borderRadius: "50%", padding: "2px", background: "#FAFAF9", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <VendorAvatar src={vendor.username === user?.username && user?.profile_image ? user.profile_image : vendor.profile_picture} name={vendor.business_name || vendor.username} />
                            </div>
                          </div>
                          {vendor.vendor_badge && vendor.vendor_badge !== "none" && (
                            <div className={`absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full border-2 border-white flex items-center justify-center text-[8px] font-bold
                              ${vendor.vendor_badge === "top" ? "bg-amber-400" : vendor.vendor_badge === "trusted" ? "bg-teal-500" : "bg-purple-500"}`}>
                              {vendor.vendor_badge === "top" ? "⭐" : vendor.vendor_badge === "trusted" ? "✓" : "↑"}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-stone-900 text-sm truncate">{vendor.business_name || vendor.username}</p>
                          {vendor.total_reviews > 0 && (
                            <div className="flex items-center gap-0.5 mt-0.5">
                              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                              <span className="text-xs text-stone-400">{vendor.rating} ({vendor.total_reviews})</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* CTA — desktop */}
            {!isLoggedIn && (
              <div className="bg-white border border-stone-200 rounded-2xl p-6 text-center shadow-sm">
                <Shield className="w-8 h-8 mx-auto mb-3 text-teal-600" />
                <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-bold mb-1">Safe & Secure</p>
                <h3 className="text-xl font-black italic tracking-tighter uppercase text-stone-900 mb-1"
                  style={{ fontFamily: "var(--font-jakarta), 'Plus Jakarta Sans', sans-serif" }}>
                  Ready to book?
                </h3>
                <p className="text-stone-400 text-sm mb-4">Create a free account to book any service.</p>
                <Link href="/auth">
                  <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                    className="w-full py-3 text-white font-semibold rounded-full text-sm shadow-lg shadow-teal-200/60 inline-flex items-center justify-center gap-2"
                    style={{ background: GRAD }}>
                    Create Account <ArrowRight className="w-4 h-4" />
                  </motion.button>
                </Link>
              </div>
            )}

          </div>{/* end sidebar */}

          </div>{/* end grid */}
        </div>
      </div>
    </>
  );
}