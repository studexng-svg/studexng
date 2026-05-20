"use client";

import { useEffect, useState, useRef } from "react";
import {
  Search, ArrowRight, Heart, X, Sparkles, Star, Shield,
  ChevronRight, Clock, Plus, Trophy, ShieldCheck, Tag, Zap, Headphones,
} from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth, fetchWithAuth } from "@/lib/authStore";
import { useWishlistStore } from "@/lib/wishlistStore";
import { useCart } from "@/lib/cartStore";
import { GRAD, GRAD_TEXT, SERIF } from "@/lib/tokens";
import VendorOfMonthModal from "@/components/VendorOfMonthModal";

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
  is_online?: boolean;
}

interface Category {
  id: number;
  title: string;
  slug: string;
  image: string | null;
}

function SafeImage({ src, alt, className }: { src: string | null | undefined; alt: string; className?: string }) {
  const [error, setError] = useState(false);
  if (!src || error || !src.startsWith("http")) {
    return (
      <div className={`w-full h-full bg-gradient-to-br from-teal-50 to-purple-50 flex items-center justify-center ${className || ""}`}>
        <Sparkles className="w-6 h-6 text-stone-300" />
      </div>
    );
  }
  return (
    <img src={src} alt={alt} loading="lazy" decoding="async"
      className={`w-full h-full object-cover ${className || ""}`}
      onError={() => setError(true)} />
  );
}

const BADGE_LABELS: Record<string, string> = { top: "⭐ Top Vendor", trusted: "✓ Trusted", rising: "↑ Rising" };
const BADGE_STYLES: Record<string, string> = {
  top: "bg-amber-50 text-amber-700 border border-amber-200",
  trusted: "bg-teal-50 text-teal-700 border border-teal-200",
  rising: "bg-purple-50 text-purple-700 border border-purple-200",
};

const TRUST_ITEMS = [
  { icon: ShieldCheck, title: "Verified Vendors", desc: "Every vendor is campus-verified" },
  { icon: Tag,         title: "Campus Prices",    desc: "Competitive rates, always" },
  { icon: Zap,         title: "Fast Service",     desc: "Get it done on campus" },
  { icon: Headphones,  title: "Secure Payments",  desc: "Protected transactions" },
];

function ListingSkeletons() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="bg-white rounded-2xl border border-stone-100 overflow-hidden animate-pulse">
          <div className="w-full h-40 bg-stone-100" />
          <div className="p-3 space-y-2">
            <div className="h-3 bg-stone-100 rounded-full w-3/4" />
            <div className="h-2.5 bg-stone-100 rounded-full w-1/2" />
            <div className="flex justify-between mt-2">
              <div className="h-6 bg-stone-100 rounded-full w-16" />
              <div className="h-8 bg-stone-100 rounded-full w-20" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

interface Props {
  initialVendors: Vendor[];
  initialListings: any[];
  initialCategories: Category[];
  vendorOfMonth?: any;
}

export default function HomePageClient({ initialVendors, initialListings, initialCategories, vendorOfMonth = null }: Props) {
  const { isLoggedIn, user, isHydrated } = useAuth();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlistStore();
  const { addToCart, cart } = useCart();

  const [mounted, setMounted]         = useState(false);
  const [campusReady, setCampusReady] = useState(false);
  const [toast, setToast]             = useState("");
  const [activeTab, setActiveTab]     = useState<"listings" | "vendors">("listings");

  const [vendors, setVendors]         = useState<Vendor[]>(initialVendors);
  const [allListings, setAllListings] = useState<any[]>(initialListings);
  const [categories, setCategories]   = useState<Category[]>(initialCategories);
  const [activeFilter, setActiveFilter] = useState("All");
  const [currentCampus, setCurrentCampus] = useState<"pau" | "futo">("pau");

  const [searchQuery, setSearchQuery]   = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching]       = useState(false);
  const [showResults, setShowResults]   = useState(false);

  const listingsSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    const c = document.cookie.split(";").find(s => s.trim().startsWith("studex_campus="))?.split("=")?.[1]?.toLowerCase();
    if (c === "pau" || c === "futo") setCurrentCampus(c);
  }, []);

  const switchCampus = async (campus: "pau" | "futo") => {
    if (campus === currentCampus) return;
    const isHttps = window.location.protocol === "https:";
    document.cookie = `studex_campus=${campus}; path=/; max-age=31536000; SameSite=Lax${isHttps ? "; Secure" : ""}`;
    setCurrentCampus(campus);
    setCampusReady(false);
    setActiveFilter("All");
    try {
      const [listRes, vendorRes, catRes] = await Promise.all([
        fetch(`${API_URL}/api/services/listings/?campus=${campus}&page_size=500`),
        fetch(`${API_URL}/api/auth/vendors/?campus=${campus}`),
        fetch(`${API_URL}/api/services/categories/?campus=${campus}`),
      ]);
      if (listRes.ok)   { const d = await listRes.json();   setAllListings(d.results || d || []); }
      if (vendorRes.ok) { const d = await vendorRes.json(); setVendors(d.results || d || []); }
      if (catRes.ok)    { const d = await catRes.json();    setCategories(d.results || d || []); }
    } catch {}
    finally { setCampusReady(true); }
  };

  useEffect(() => {
    if (!isHydrated) return;
    if (!isLoggedIn || !user) { setCampusReady(true); return; }
    const userSchool = ((user as any).school || "").toLowerCase();
    if (userSchool !== "pau" && userSchool !== "futo") { setCampusReady(true); return; }
    const cookieCampus = document.cookie.split(";").find(c => c.trim().startsWith("studex_campus="))?.split("=")?.[1]?.toLowerCase() || "pau";
    if (cookieCampus === userSchool) { setCampusReady(true); return; }
    const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
    document.cookie = `studex_campus=${userSchool}; path=/; max-age=31536000; SameSite=Lax${isHttps ? "; Secure" : ""}`;
    Promise.all([
      fetchWithAuth(`${API_URL}/api/services/listings/?campus=${userSchool}&page_size=500`),
      fetchWithAuth(`${API_URL}/api/auth/vendors/?campus=${userSchool}`),
      fetchWithAuth(`${API_URL}/api/services/categories/?campus=${userSchool}`),
    ]).then(async ([listRes, vendorRes, catRes]) => {
      if (listRes.ok)   { const d = await listRes.json();   setAllListings(d.results || d || []); }
      if (vendorRes.ok) { const d = await vendorRes.json(); setVendors(d.results || d || []); }
      if (catRes.ok)    { const d = await catRes.json();    setCategories(d.results || d || []); }
    }).catch(() => {}).finally(() => setCampusReady(true));
  }, [isHydrated, isLoggedIn, (user as any)?.school]);

  const handleFilter = (filter: string) => {
    setActiveFilter(filter);
    setActiveTab("listings");
    setTimeout(() => listingsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); setShowResults(false); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const url = `${API_URL}/api/services/listings/?search=${encodeURIComponent(searchQuery)}`;
        const res = isLoggedIn ? await fetchWithAuth(url) : await fetch(url);
        const data = await res.json();
        setSearchResults(data.results || data || []);
        setShowResults(true);
      } catch { setSearchResults([]); }
      finally { setSearching(false); }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery, isLoggedIn]);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2000); };

  const filteredListings = activeFilter === "All" ? allListings : allListings.filter(l => l.category === activeFilter);
  const categorySections = categories.map(cat => ({ ...cat, items: allListings.filter(l => l.category === cat.slug) })).filter(s => s.items.length > 0);
  const categorisedSlugs = new Set(categories.map(c => c.slug));
  const uncategorisedListings = allListings.filter(l => !categorisedSlugs.has(l.category));
  const allSections = uncategorisedListings.length > 0
    ? [...categorySections, { id: 0, title: "Other", slug: "__other__", image: null, items: uncategorisedListings }]
    : categorySections;

  const renderListingCard = (listing: any, i: number) => {
    const badge        = listing.vendor?.profile?.vendor_badge;
    const rating       = listing.vendor?.profile?.rating;
    const totalReviews = listing.vendor?.profile?.total_reviews;
    const wishlisted   = mounted && isInWishlist(listing.id);
    const isService    = (listing.listing_type || "").toLowerCase() === "service";
    const isOwnListing = !!(user?.id && user.id === listing.vendor?.id);
    const isReserved   = !isService && !isOwnListing && !!listing.is_reserved;
    const inCart       = cart.some(ci => ci.id === listing.id);

    return (
      <motion.div key={listing.id} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }} transition={{ delay: Math.min(i * 0.04, 0.2) }}
        className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden">
        <Link href={`/listing/${listing.id}`} className="block">
          <div className="relative w-full h-40 lg:h-44 overflow-hidden">
            <SafeImage src={listing.image?.startsWith("http") ? listing.image : null} alt={listing.title} />
            {!listing.is_available && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <span className="text-white font-bold bg-red-500 px-3 py-1 rounded-full text-xs">Unavailable</span>
              </div>
            )}
            {badge && badge !== "none" && (
              <div className="absolute top-2 left-2">
                <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full backdrop-blur-sm ${BADGE_STYLES[badge]}`}>
                  {BADGE_LABELS[badge]}
                </span>
              </div>
            )}
            <motion.button onClick={(e) => {
              e.preventDefault(); e.stopPropagation();
              const item = { id: listing.id, title: listing.title, price: listing.price, img: listing.image };
              if (wishlisted) { removeFromWishlist(listing.id); showToast("Removed from Wishlist"); }
              else { addToWishlist(item); showToast("Added to Wishlist ❤️"); }
            }} whileTap={{ scale: 0.85 }}
              className="absolute top-2 right-2 w-7 h-7 bg-white/90 backdrop-blur-sm rounded-full shadow flex items-center justify-center z-10">
              <Heart className={`w-3.5 h-3.5 transition-colors ${wishlisted ? "fill-red-500 text-red-500" : "text-stone-400"}`} />
            </motion.button>
            {!isOwnListing && (
              <motion.button onClick={(e) => {
                e.preventDefault(); e.stopPropagation();
                addToCart({ id: listing.id, title: listing.title, price: listing.price, img: listing.image || "" });
                showToast(inCart ? "Cart updated" : "Added to cart");
              }} whileTap={{ scale: 0.85 }}
                className="absolute bottom-2 right-2 w-7 h-7 rounded-full shadow-lg flex items-center justify-center z-10"
                style={{ background: GRAD }}>
                <Plus className="w-3.5 h-3.5 text-white" />
              </motion.button>
            )}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent pt-6 pb-2 px-3">
              <p className="text-white font-bold text-xs leading-tight line-clamp-1">{listing.title}</p>
              <p className="text-white/75 text-[10px] mt-0.5">@{listing.vendor?.username || listing.vendor}</p>
            </div>
          </div>
          <div className="px-3 pt-2 pb-0.5">
            {totalReviews > 0 && (
              <div className="flex items-center gap-0.5 mb-1">
                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                <span className="text-[10px] text-stone-500 font-medium">{rating}</span>
                <span className="text-[10px] text-stone-400">({totalReviews})</span>
              </div>
            )}
            <p className="text-[11px] text-stone-500 line-clamp-2 leading-relaxed">{listing.description || "Tap to view details."}</p>
          </div>
        </Link>
        <div className="px-3 py-2.5 flex items-center justify-between gap-1">
          <div className="min-w-0">
            <p className="text-[10px] text-stone-400 font-medium">Price</p>
            <p className="text-sm font-bold text-stone-900 truncate">₦{Number(listing.price).toLocaleString()}</p>
          </div>
          {isReserved ? (
            <div className="flex items-center gap-1 px-3 py-1.5 bg-stone-100 border border-stone-200 rounded-full text-stone-400 font-semibold text-[10px] uppercase tracking-wide cursor-not-allowed shrink-0">
              <Clock className="w-3 h-3" /> Reserved
            </div>
          ) : (
            <Link href={isOwnListing ? "/seller/listings" : `/listing/${listing.id}`} className="shrink-0">
              <motion.button whileTap={{ scale: 0.96 }}
                className="px-3 py-1.5 text-white rounded-full font-black text-[11px] uppercase tracking-wide"
                style={{ background: GRAD }}>
                {isOwnListing ? "Manage" : isService ? "Book" : "Order"}
              </motion.button>
            </Link>
          )}
        </div>
      </motion.div>
    );
  };

  const renderVendorCard = (vendor: Vendor, i: number) => {
    const src = vendor.username === (user as any)?.username && (user as any)?.profile_image
      ? (user as any).profile_image : vendor.profile_picture;
    const displaySrc = src?.startsWith("http") ? src : null;
    const initials = (vendor.business_name || vendor.username || "??").slice(0, 2).toUpperCase();

    return (
      <motion.div key={vendor.id} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }} transition={{ delay: Math.min(i * 0.05, 0.3) }}>
        <Link href={`/vendor/${vendor.username}`}>
          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden hover:border-teal-200 hover:shadow-md transition-all group cursor-pointer">
            <div className="relative w-full aspect-square overflow-hidden bg-stone-50">
              {displaySrc ? (
                <img src={displaySrc} alt={vendor.business_name || vendor.username}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white text-3xl font-black" style={{ background: GRAD }}>
                  {initials}
                </div>
              )}
              {vendor.is_online && (
                <div className="absolute top-2.5 right-2.5 flex items-center gap-1 bg-white/90 backdrop-blur-sm px-2 py-0.5 rounded-full shadow-sm">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  <span className="text-[10px] font-semibold text-stone-700">Online</span>
                </div>
              )}
              {vendor.vendor_badge && vendor.vendor_badge !== "none" && (
                <div className="absolute bottom-2.5 left-2.5">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${BADGE_STYLES[vendor.vendor_badge]}`}>
                    {BADGE_LABELS[vendor.vendor_badge]}
                  </span>
                </div>
              )}
            </div>
            <div className="p-3">
              <p className="font-bold text-stone-900 text-sm truncate">{vendor.business_name || vendor.username}</p>
              <p className="text-stone-400 text-xs truncate">@{vendor.username}</p>
              <div className="flex items-center justify-between mt-2">
                {vendor.total_reviews > 0 ? (
                  <div className="flex items-center gap-0.5">
                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                    <span className="text-xs text-stone-600 font-medium">{vendor.rating}</span>
                    <span className="text-xs text-stone-400">({vendor.total_reviews})</span>
                  </div>
                ) : <span className="text-xs text-stone-400">New vendor</span>}
                <span className="text-xs text-stone-400">{vendor.total_listings} listings</span>
              </div>
            </div>
          </div>
        </Link>
      </motion.div>
    );
  };

  return (
    <>
      <VendorOfMonthModal vendor={vendorOfMonth} />

      {toast && (
        <motion.div initial={{ y: -50, opacity: 0 }} animate={{ y: 60, opacity: 1 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full shadow-lg z-50 font-medium text-sm text-white"
          style={{ background: GRAD }}>
          {toast}
        </motion.div>
      )}

      <div className="min-h-screen bg-[#F8F7F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>

        {/* ── HEADER ── */}
        <header className="sticky top-0 bg-white/95 backdrop-blur-md z-40 border-b border-stone-100 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
            <Link href="/home" className="flex items-center gap-2 flex-shrink-0">
              <div className="w-9 h-9 rounded-full bg-white border border-stone-200 flex items-center justify-center p-1 shadow-sm overflow-hidden">
                <img src="/images/logo-1.jpg" alt="StudEx" loading="lazy" className="w-full h-full object-contain" />
              </div>
              <span className="font-bold text-lg text-stone-900 hidden sm:block" style={SERIF}>
                Stud<span style={GRAD_TEXT}>Ex</span>
              </span>
            </Link>

            <div className="relative flex-1 max-w-lg">
              <Search className="w-4 h-4 absolute left-3 top-3 text-stone-400 pointer-events-none" />
              <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                onFocus={() => searchResults.length > 0 && setShowResults(true)}
                onBlur={() => setTimeout(() => setShowResults(false), 200)}
                placeholder="Search services..."
                className="w-full pl-9 pr-8 py-2.5 bg-stone-50 text-stone-900 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 border border-stone-200 placeholder:text-stone-400 transition-all" />
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
                    ) : searchResults.map(item => (
                      <Link key={item.id} href={`/listing/${item.id}`} onClick={() => { setShowResults(false); setSearchQuery(""); }}>
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
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex items-center gap-3 flex-shrink-0">
              {isLoggedIn && user && (
                <span className="hidden lg:block text-sm text-stone-500">
                  Hi, <span className="font-semibold text-stone-900">{(user as any).username}</span>
                </span>
              )}
              {!isLoggedIn && (
                <Link href="/auth">
                  <motion.button whileTap={{ scale: 0.97 }}
                    className="px-4 py-2 text-white font-medium rounded-full text-sm shadow-sm" style={{ background: GRAD }}>
                    Login
                  </motion.button>
                </Link>
              )}
            </div>
          </div>
        </header>

        {/* ── PAGE BODY ── */}
        <div className="max-w-7xl mx-auto px-4 pt-6 pb-32">
          <div className="lg:flex lg:gap-6">

            {/* ── LEFT SIDEBAR (desktop) ── */}
            <aside className="hidden lg:block w-52 flex-shrink-0">
              <div className="sticky space-y-3" style={{ top: "80px" }}>

                {/* Categories */}
                <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-stone-50">
                    <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Categories</p>
                  </div>
                  <button onClick={() => handleFilter("All")}
                    className={`w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold border-b border-stone-50 transition ${activeFilter === "All" && activeTab === "listings" ? "text-teal-600 bg-teal-50/60" : "text-stone-700 hover:bg-stone-50"}`}>
                    All
                    {activeFilter === "All" && activeTab === "listings" && <ChevronRight className="w-3.5 h-3.5" />}
                  </button>
                  {categories.map(cat => (
                    <button key={cat.slug} onClick={() => handleFilter(cat.slug)}
                      className={`w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium border-b border-stone-50 last:border-0 transition ${activeFilter === cat.slug && activeTab === "listings" ? "text-teal-600 bg-teal-50/60" : "text-stone-600 hover:bg-stone-50"}`}>
                      {cat.title}
                      {activeFilter === cat.slug && activeTab === "listings" && <ChevronRight className="w-3.5 h-3.5" />}
                    </button>
                  ))}
                </div>

                {/* Campus toggle */}
                {mounted && (!isLoggedIn || !(user as any)?.school) && (
                  <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4">
                    <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2.5">Campus</p>
                    <div className="flex gap-2">
                      {(["pau", "futo"] as const).map(c => (
                        <button key={c} onClick={() => switchCampus(c)}
                          className={`flex-1 py-1.5 rounded-xl text-xs font-bold uppercase transition ${currentCampus === c ? "text-white" : "bg-stone-100 text-stone-500 hover:bg-stone-200"}`}
                          style={currentCampus === c ? { background: GRAD } : {}}>
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </aside>

            {/* ── MAIN CONTENT ── */}
            <div className="flex-1 min-w-0 space-y-5">

              {/* HERO */}
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                className="relative rounded-3xl overflow-hidden flex items-center min-h-[260px] lg:min-h-[340px]"
                style={{ background: "linear-gradient(135deg,#0D9488 0%,#4F46E5 55%,#7C3AED 100%)" }}>

                {/* Decorative blobs */}
                <div className="absolute -top-20 right-[38%] w-96 h-96 rounded-full pointer-events-none"
                  style={{ background: "radial-gradient(circle,rgba(139,92,246,0.45) 0%,transparent 70%)" }} />
                <div className="absolute -bottom-20 left-[30%] w-72 h-72 rounded-full pointer-events-none"
                  style={{ background: "radial-gradient(circle,rgba(20,184,166,0.3) 0%,transparent 70%)" }} />

                {/* Text */}
                <div className="relative z-10 flex-1 px-8 py-10 lg:max-w-[56%]">
                  {vendorOfMonth ? (
                    <>
                      <div className="flex items-center gap-1.5 bg-amber-400 w-fit px-3 py-1 rounded-full mb-5">
                        <Trophy className="w-3 h-3 text-amber-900" />
                        <span className="text-amber-900 text-xs font-bold">Vendor of the Month · {vendorOfMonth.month}</span>
                      </div>
                      <h1 className="text-3xl lg:text-5xl font-black text-white leading-[1.1] mb-3"
                        style={{ fontFamily: "var(--font-jakarta),'Plus Jakarta Sans',sans-serif" }}>
                        {vendorOfMonth.business_name}
                      </h1>
                      <p className="text-white/75 text-sm mb-6">
                        {vendorOfMonth.total_orders} orders last month{vendorOfMonth.rating > 0 && ` · ⭐ ${vendorOfMonth.rating.toFixed(1)}`}
                      </p>
                      <Link href={`/vendor/${vendorOfMonth.username}`}>
                        <motion.button whileTap={{ scale: 0.97 }}
                          className="bg-white text-stone-900 font-bold px-7 py-3.5 rounded-full text-sm inline-flex items-center gap-2 shadow-lg w-fit">
                          Shop Now <ArrowRight className="w-4 h-4" />
                        </motion.button>
                      </Link>
                    </>
                  ) : (
                    <>
                      <div className="bg-white/20 backdrop-blur-sm border border-white/20 w-fit px-3 py-1 rounded-full mb-5">
                        <span className="text-white text-[10px] font-bold tracking-[0.2em] uppercase">Campus Marketplace</span>
                      </div>
                      <h1 className="text-3xl lg:text-5xl font-black text-white leading-[1.1] mb-4"
                        style={{ fontFamily: "var(--font-jakarta),'Plus Jakarta Sans',sans-serif" }}>
                        Shop Smart.<br />Live Campus.
                      </h1>
                      <p className="text-white/75 text-sm lg:text-base mb-7 leading-relaxed max-w-sm">
                        Discover services and products from verified vendors on your campus.
                      </p>
                      <Link href="/categories">
                        <motion.button whileTap={{ scale: 0.97 }}
                          className="bg-white text-stone-900 font-bold px-7 py-3.5 rounded-full text-sm inline-flex items-center gap-2 shadow-lg w-fit">
                          Shop Now <ArrowRight className="w-4 h-4" />
                        </motion.button>
                      </Link>
                    </>
                  )}
                </div>

                {/* Product image — desktop only */}
                <div className="hidden lg:block absolute right-0 top-0 bottom-0 w-[44%] pointer-events-none">
                  {/* Left-edge blend */}
                  <div className="absolute inset-y-0 left-0 w-28 z-10"
                    style={{ background: "linear-gradient(to right,#4F46E5,transparent)" }} />
                  <img
                    src="https://plus.unsplash.com/premium_photo-1681487865280-c2b836dd83e8?fm=jpg&q=80&w=900&auto=format&fit=crop"
                    alt="Shop on StudEx"
                    className="w-full h-full object-cover object-center"
                  />
                </div>
              </motion.div>

              {/* TRUST BAR */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {TRUST_ITEMS.map(({ icon: Icon, title, desc }) => (
                  <div key={title} className="bg-white rounded-2xl border border-stone-100 p-3.5 flex items-center gap-3 shadow-sm">
                    <div className="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center bg-gradient-to-br from-teal-50 to-purple-50">
                      <Icon className="w-4 h-4 text-teal-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-stone-900 text-xs truncate">{title}</p>
                      <p className="text-stone-400 text-[10px] truncate">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* MOBILE: category chips */}
              <div className="lg:hidden flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
                {[{ slug: "All", title: "All" }, ...categories.map(c => ({ slug: c.slug, title: c.title }))].map(tab => (
                  <button key={tab.slug} onClick={() => { setActiveTab("listings"); handleFilter(tab.slug); }}
                    className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${activeFilter === tab.slug && activeTab === "listings" ? "text-white shadow-sm" : "bg-stone-100 text-stone-500"}`}
                    style={activeFilter === tab.slug && activeTab === "listings" ? { background: GRAD } : {}}>
                    {tab.title}
                  </button>
                ))}
              </div>

              {/* MOBILE: campus toggle */}
              {mounted && (!isLoggedIn || !(user as any)?.school) && (
                <div className="lg:hidden flex items-center gap-2">
                  <span className="text-[11px] text-stone-400 font-medium">Campus:</span>
                  {(["pau", "futo"] as const).map(c => (
                    <button key={c} onClick={() => switchCampus(c)}
                      className={`px-3 py-1 rounded-full text-xs font-bold uppercase transition ${currentCampus === c ? "text-white" : "bg-stone-100 text-stone-500"}`}
                      style={currentCampus === c ? { background: GRAD } : {}}>
                      {c}
                    </button>
                  ))}
                </div>
              )}

              {/* SECTION HEADER + TAB SWITCHER */}
              <div className="flex items-end justify-between">
                <div>
                  {isLoggedIn && user ? (
                    <>
                      <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-bold">Welcome back</p>
                      <h2 className="text-2xl font-black text-stone-900 mt-0.5"
                        style={{ fontFamily: "var(--font-jakarta),'Plus Jakarta Sans',sans-serif" }}>
                        Hey, {(user as any).username} 👋
                      </h2>
                    </>
                  ) : (
                    <>
                      <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-bold">
                        {activeTab === "listings"
                          ? activeFilter === "All" ? "All Listings" : categories.find(c => c.slug === activeFilter)?.title || activeFilter
                          : "Campus Vendors"}
                      </p>
                      <h2 className="text-2xl font-black text-stone-900 mt-0.5"
                        style={{ fontFamily: "var(--font-jakarta),'Plus Jakarta Sans',sans-serif" }}>
                        {activeTab === "listings" ? "Featured Services" : "Meet the Vendors"}
                      </h2>
                    </>
                  )}
                </div>
                <div className="flex bg-stone-100 rounded-full p-1 flex-shrink-0">
                  {(["listings", "vendors"] as const).map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                      className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all capitalize ${activeTab === tab ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"}`}>
                      {tab === "listings" ? "Listings" : "Vendors"}
                    </button>
                  ))}
                </div>
              </div>

              {/* LISTINGS TAB */}
              {activeTab === "listings" && (
                <div ref={listingsSectionRef}>
                  {mounted && !campusReady ? (
                    <ListingSkeletons />
                  ) : activeFilter === "All" ? (
                    allListings.length === 0 ? (
                      <div className="bg-white rounded-2xl p-12 text-center border border-stone-100 shadow-sm">
                        <Sparkles className="w-12 h-12 text-stone-200 mx-auto mb-3" />
                        <h3 className="text-lg font-bold text-stone-400">No listings yet</h3>
                        <p className="text-stone-400 text-sm mt-1">Check back soon!</p>
                      </div>
                    ) : (
                      <div className="space-y-10">
                        {allSections.map(section => (
                          <motion.div key={section.slug} id={`section-${section.slug}`}
                            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-60px" }}>
                            <div className="flex items-center justify-between mb-4">
                              <div>
                                <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-bold">
                                  {section.items.length} listing{section.items.length !== 1 ? "s" : ""}
                                </p>
                                <h3 className="text-xl font-black text-stone-900 mt-0.5"
                                  style={{ fontFamily: "var(--font-jakarta),'Plus Jakarta Sans',sans-serif" }}>
                                  {section.title}
                                </h3>
                              </div>
                              {section.slug !== "__other__" && (
                                <button onClick={() => handleFilter(section.slug)}
                                  className="flex items-center gap-1 text-stone-400 text-sm font-medium hover:text-teal-600 transition">
                                  View All <ChevronRight className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                              {section.items.map((listing, i) => renderListingCard(listing, i))}
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    )
                  ) : (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-bold">
                            {filteredListings.length} listing{filteredListings.length !== 1 ? "s" : ""}
                          </p>
                          <h3 className="text-xl font-black text-stone-900 mt-0.5"
                            style={{ fontFamily: "var(--font-jakarta),'Plus Jakarta Sans',sans-serif" }}>
                            {categories.find(c => c.slug === activeFilter)?.title || activeFilter}
                          </h3>
                        </div>
                        <button onClick={() => handleFilter("All")}
                          className="flex items-center gap-1 text-stone-400 text-sm font-medium hover:text-teal-600 transition">
                          All categories <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                      {filteredListings.length === 0 ? (
                        <div className="bg-white rounded-2xl p-12 text-center border border-stone-100 shadow-sm">
                          <Sparkles className="w-12 h-12 text-stone-200 mx-auto mb-3" />
                          <h3 className="text-lg font-bold text-stone-400">Nothing here yet</h3>
                          <p className="text-stone-400 text-sm mt-1">No listings in this category.</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                          {filteredListings.map((listing, i) => renderListingCard(listing, i))}
                        </div>
                      )}
                    </motion.div>
                  )}
                </div>
              )}

              {/* VENDORS TAB */}
              {activeTab === "vendors" && (
                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
                  {vendors.length === 0 ? (
                    <div className="bg-white rounded-2xl p-12 text-center border border-stone-100 shadow-sm">
                      <Sparkles className="w-12 h-12 text-stone-200 mx-auto mb-3" />
                      <h3 className="text-lg font-bold text-stone-400">No vendors yet</h3>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {vendors.map((vendor, i) => renderVendorCard(vendor, i))}
                    </div>
                  )}
                </motion.div>
              )}

              {/* CTA BANNER */}
              <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                className="rounded-3xl overflow-hidden" style={{ background: GRAD }}>
                <div className="px-6 lg:px-10 py-8 lg:py-10 flex flex-col lg:flex-row items-center justify-between gap-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center flex-shrink-0">
                      <Tag className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <p className="text-white font-black text-xl">{isLoggedIn ? "Keep Exploring" : "Become a Vendor"}</p>
                      <p className="text-white/70 text-sm">
                        {isLoggedIn ? "Discover hundreds of campus services." : "Join our marketplace and start selling to students on campus."}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-8 lg:gap-12">
                    {[["500+", "Active Vendors"], ["10K+", "Listings"], ["2", "Campuses"]].map(([num, label]) => (
                      <div key={label} className="text-center">
                        <p className="text-white font-black text-2xl">{num}</p>
                        <p className="text-white/60 text-xs">{label}</p>
                      </div>
                    ))}
                  </div>
                  <Link href={isLoggedIn ? "/categories" : "/auth"} className="flex-shrink-0">
                    <motion.button whileTap={{ scale: 0.97 }}
                      className="bg-white text-stone-900 font-bold px-6 py-3 rounded-full text-sm inline-flex items-center gap-2 shadow-md">
                      {isLoggedIn ? "Shop Now" : "Start Selling"} <ArrowRight className="w-4 h-4" />
                    </motion.button>
                  </Link>
                </div>
              </motion.div>

            </div>{/* end main content */}
          </div>{/* end flex */}
        </div>
      </div>
    </>
  );
}
