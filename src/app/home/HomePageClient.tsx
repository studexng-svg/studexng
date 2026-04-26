"use client";

import { useEffect, useState, Suspense } from "react";
import { Search, ArrowRight, Heart, X, Sparkles, Star, MapPin, Shield, ChevronRight } from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth, fetchWithAuth } from "@/lib/authStore";
import { useWishlistStore } from "@/lib/wishlistStore";

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
  if (!src || error) {
    return (
      <div className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0 shadow-md"
        style={{ background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" }}>
        {initials}
      </div>
    );
  }
  return (
    <div className="w-16 h-16 rounded-full overflow-hidden flex-shrink-0 shadow-md">
      <img src={src} alt={name} className="w-full h-full object-cover block" onError={() => setError(true)} />
    </div>
  );
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

interface Props {
  initialVendors: Vendor[];
  initialListings: any[];
}

export default function HomePageClient({ initialVendors, initialListings }: Props) {
  const { isLoggedIn, user, isHydrated } = useAuth();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlistStore();

  const [mounted, setMounted] = useState(false);
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

  // After hydration, refetch listings and vendors scoped to the user's campus.
  // SSR fetched anonymously (defaulting to PAU), so FUTO users need a client-side refetch.
  useEffect(() => {
    if (!isHydrated || !isLoggedIn || !user) return;
    const campus = (user.school || 'pau').toLowerCase();
    // PAU is already correct from SSR — skip unless the user is on a different campus
    if (campus === 'pau') return;

    Promise.all([
      fetchWithAuth(`${API_URL}/api/services/listings/`),
      fetchWithAuth(`${API_URL}/api/auth/vendors/`),
    ]).then(async ([listRes, vendorRes]) => {
      if (listRes.ok) {
        const listData = await listRes.json();
        const fresh = listData.results || listData || [];
        setAllListings(fresh);
        setListings(fresh);
        setActiveFilter("All");
      }
      if (vendorRes.ok) {
        const vendorData = await vendorRes.json();
        setVendors(vendorData.results || vendorData || []);
      }
    }).catch(() => {});
  }, [isHydrated, isLoggedIn, user?.school]);

  const filters = ["All", "Services", "Products", "Food", "Beauty"];
  const handleFilter = (filter: string) => {
    setActiveFilter(filter);
    if (filter === "All") { setListings(allListings); return; }
    const filtered = allListings.filter(l => {
      const cat = (l.category?.title || "").toLowerCase();
      const type = (l.listing_type || "").toLowerCase();
      if (filter === "Services") return type === "service";
      if (filter === "Products") return type === "product";
      if (filter === "Food") return cat.includes("food") || cat.includes("drink");
      if (filter === "Beauty") return cat.includes("nail") || cat.includes("lash") || cat.includes("hair") || cat.includes("make") || cat.includes("brow") || cat.includes("body");
      return true;
    });
    setListings(filtered);
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

  const BADGE_WEIGHT: Record<string, number> = { top: 3, trusted: 2, rising: 1, none: 0 };
  const sortedListings = [...listings].sort((a, b) => {
    const aBadge = BADGE_WEIGHT[a.vendor?.profile?.vendor_badge || "none"];
    const bBadge = BADGE_WEIGHT[b.vendor?.profile?.vendor_badge || "none"];
    if (bBadge !== aBadge) return bBadge - aBadge;
    return (b.vendor?.profile?.completion_rate || 0) - (a.vendor?.profile?.completion_rate || 0);
  });

  const featuredListings = sortedListings.slice(0, 6);

  return (
    <>
      {toast && (
        <motion.div initial={{ y: -50, opacity: 0 }} animate={{ y: 60, opacity: 1 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full shadow-lg z-50 font-medium text-sm text-white bg-teal-600">
          {toast}
        </motion.div>
      )}

      <div className="min-h-screen bg-[#FAFAF9]" style={{ fontFamily: "'DM Sans', sans-serif" }}>

        {/* ── STICKY HEADER ── */}
        <div className="sticky top-0 bg-white/80 backdrop-blur-md z-40 border-b border-stone-100 shadow-sm">
          <div className="flex items-center justify-between px-4 py-3 gap-3">
            <Link href="/home" className="flex items-center gap-2 flex-shrink-0">
              <img src="/images/logo-1.jpg" alt="StudEx" loading="lazy" className="w-9 h-9 rounded-full object-cover shadow-sm" />
              <span className="font-bold text-lg text-stone-900" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                Stud<span style={{
                  background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}>Ex</span>
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
                            <p className="font-bold text-sm flex-shrink-0" style={{
                              background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)",
                              WebkitBackgroundClip: "text",
                              WebkitTextFillColor: "transparent",
                              backgroundClip: "text",
                            }}>₦{Number(item.price).toLocaleString()}</p>
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
                  style={{ background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" }}>
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
                style={activeFilter === filter ? { background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" } : {}}>
                {filter}
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 pt-6 pb-28 space-y-8 max-w-2xl mx-auto">

          {/* ── GREETING ── */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            {isLoggedIn && user ? (
              <>
                <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-semibold">Welcome back</p>
                <h1 className="text-2xl font-bold text-stone-900 mt-1" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                  Hey, {user.username || "there"} 👋
                </h1>
                <p className="text-stone-400 text-sm mt-0.5">Here's what's available on campus today.</p>
              </>
            ) : (
              <>
                <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-semibold">PAU Campus Marketplace</p>
                <h1 className="text-2xl font-bold text-stone-900 mt-1" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                  Discover Services
                </h1>
                <p className="text-stone-400 text-sm mt-0.5">Browse verified vendors on campus.</p>
              </>
            )}
          </motion.div>

          {/* ── HERO BANNER ── */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Link href="/categories">
              <motion.div whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }}
                className="relative rounded-2xl overflow-hidden h-36 cursor-pointer shadow-md"
                style={{ background: "linear-gradient(135deg, #0b1a18 0%, #1a0b2e 100%)" }}>
                <div className="absolute top-0 right-0 w-48 h-48 rounded-full bg-teal-500/20 blur-3xl pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-40 h-40 rounded-full bg-purple-600/20 blur-3xl pointer-events-none" />
                <div className="absolute inset-0 opacity-[0.04]"
                  style={{ backgroundImage: `radial-gradient(circle, #5eead4 1px, transparent 1px)`, backgroundSize: "24px 24px" }} />
                <div className="relative z-10 h-full flex flex-col justify-center px-6">
                  <p className="text-teal-400 text-xs tracking-[0.25em] uppercase font-semibold mb-1">Campus Marketplace</p>
                  <h2 className="text-xl font-bold text-white" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                    Every service,{" "}
                    <span className="italic" style={{
                      background: "linear-gradient(135deg, #2dd4bf 0%, #a78bfa 100%)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                    }}>one tap away.</span>
                  </h2>
                  <p className="text-white/50 text-xs mt-2 flex items-center gap-1">
                    Browse all categories <ChevronRight className="w-3 h-3" />
                  </p>
                </div>
              </motion.div>
            </Link>
          </motion.div>

          {/* ── VENDORS ROW ── */}
          <Suspense fallback={<div className="h-20 bg-stone-100 rounded-2xl animate-pulse" />}>
          {vendors.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-semibold">On Campus</p>
                  <h2 className="text-xl font-bold text-stone-900 mt-0.5" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
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
                    <Link href={`/category/${vendor.username}`}>
                      <motion.div whileTap={{ scale: 0.95 }} className="relative cursor-pointer">
                        <VendorAvatar src={vendor.profile_picture} name={vendor.business_name || vendor.username} />
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

          {/* ── FEATURED LISTINGS ── */}
          <Suspense fallback={<div className="h-40 bg-stone-100 rounded-2xl animate-pulse" />}>
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-semibold">Available Now</p>
                <h2 className="text-xl font-bold text-stone-900 mt-0.5" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                  {activeFilter === "All" ? "Featured Services" : activeFilter}
                </h2>
              </div>
              <Link href="/categories">
                <motion.button whileHover={{ x: 3 }} className="flex items-center gap-1 text-stone-400 text-sm font-medium hover:text-teal-600 transition">
                  See all <ChevronRight className="w-4 h-4" />
                </motion.button>
              </Link>
            </div>

            {featuredListings.length === 0 ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="bg-white rounded-2xl p-12 text-center border border-stone-100 shadow-sm">
                <Sparkles className="w-12 h-12 text-stone-200 mx-auto mb-3" />
                <h3 className="text-lg font-bold text-stone-400" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                  No listings yet
                </h3>
                <p className="text-stone-400 text-sm mt-1">Check back soon!</p>
              </motion.div>
            ) : (
              <>
                {/* ── Horizontal scroll row ── */}
                <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
                  {featuredListings.map((listing, i) => {
                    const badge = listing.vendor?.profile?.vendor_badge;
                    const rating = listing.vendor?.profile?.rating;
                    const totalReviews = listing.vendor?.profile?.total_reviews;

                    return (
                      <motion.div
                        key={listing.id}
                        initial={{ opacity: 0, scale: 0.9 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: Math.min(i * 0.06, 0.3) }}
                        className="flex-shrink-0 w-[155px] bg-white border border-stone-200 hover:border-teal-300 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all relative">

                        <Link href={`/listing/${listing.id}`}>
                          <div className="relative w-full h-28 overflow-hidden">
                            <SafeImage
                              src={listing.image?.startsWith("http") ? listing.image : null}
                              alt={listing.title}
                              className="object-cover"
                            />
                            {!listing.is_available && (
                              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                <span className="text-white font-bold bg-red-500 px-2 py-1 rounded-full text-[10px]">Unavailable</span>
                              </div>
                            )}
                            {badge && badge !== "none" && (
                              <div className="absolute top-2 left-2">
                                <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${BADGE_STYLES[badge]}`}>
                                  {BADGE_LABELS[badge]}
                                </span>
                              </div>
                            )}
                          </div>
                        </Link>

                        {/* Wishlist button */}
                        <motion.button
                          onClick={(e) => {
                            e.preventDefault(); e.stopPropagation();
                            const item = { id: listing.id, title: listing.title, price: listing.price, img: listing.image };
                            if (mounted && isInWishlist(listing.id)) { removeFromWishlist(listing.id); showToast("Removed from Wishlist"); }
                            else { addToWishlist(item); showToast("Added to Wishlist ❤️"); }
                          }}
                          whileTap={{ scale: 0.9 }}
                          className="absolute top-2 right-2 w-7 h-7 bg-white/90 backdrop-blur-sm rounded-full shadow flex items-center justify-center z-10">
                          <Heart className={`w-3.5 h-3.5 ${mounted && isInWishlist(listing.id) ? "fill-red-500 text-red-500" : "text-stone-400"}`} />
                        </motion.button>

                        {/* Card body */}
                        <div className="p-3">
                          <Link href={`/listing/${listing.id}`}>
                            <p className="text-sm font-bold text-stone-900 line-clamp-1">{listing.title}</p>
                            <p className="text-xs text-stone-400 mt-0.5 mb-1">
                              @{listing.vendor?.username || listing.vendor}
                            </p>
                          </Link>

                          {totalReviews > 0 && (
                            <div className="flex items-center gap-0.5 mb-1">
                              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                              <span className="text-[10px] text-stone-400">{rating}</span>
                            </div>
                          )}

                          <p className="text-base font-bold" style={{
                            background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)",
                            WebkitBackgroundClip: "text",
                            WebkitTextFillColor: "transparent",
                            backgroundClip: "text",
                          }}>
                            ₦{Number(listing.price).toLocaleString()}
                          </p>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                {/* See all button */}
                <Link href="/categories">
                  <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}
                    className="mt-4 bg-white border border-stone-200 hover:border-teal-300 rounded-2xl p-5 flex items-center justify-between shadow-sm hover:shadow-md transition-all cursor-pointer">
                    <div>
                      <p className="font-semibold text-stone-900" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                        See all services
                      </p>
                      <p className="text-stone-400 text-sm">{allListings.length} listings available</p>
                    </div>
                    <div className="w-10 h-10 rounded-full flex items-center justify-center"
                      style={{ background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" }}>
                      <ArrowRight className="w-5 h-5 text-white" />
                    </div>
                  </motion.div>
                </Link>
              </>
            )}
          </motion.div>
          </Suspense>

          {/* ── BOTTOM CTA (logged out) ── */}
          {!isLoggedIn && (
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              className="bg-white border border-stone-200 rounded-2xl p-6 text-center shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-teal-100/60 blur-2xl pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full bg-purple-100/60 blur-2xl pointer-events-none" />
              <div className="relative z-10">
                <Shield className="w-8 h-8 mx-auto mb-3 text-teal-600" />
                <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-semibold mb-1">Safe & Secure</p>
                <h3 className="text-xl font-bold text-stone-900 mb-1" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                  Ready to book?
                </h3>
                <p className="text-stone-400 text-sm mb-5">Create a free account to book any service.</p>
                <Link href="/auth">
                  <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                    className="px-8 py-3 text-white font-semibold rounded-full text-sm shadow-lg shadow-teal-200/60 inline-flex items-center gap-2"
                    style={{ background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" }}>
                    Create Account <ArrowRight className="w-4 h-4" />
                  </motion.button>
                </Link>
              </div>
            </motion.div>
          )}

        </div>
      </div>
    </>
  );
}