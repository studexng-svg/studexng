"use client";

import { useEffect, useState, useRef } from "react";
import {
  Search, ArrowRight, Heart, X, Sparkles, Star,
  ChevronRight, ChevronDown, Clock, Plus, Trophy, ShoppingCart, User,
  ShieldCheck, Tag, Zap, Headphones,
  Shirt, Monitor, Home, BookOpen, Car,
  UtensilsCrossed, Smartphone, Scissors, WashingMachine,
  Flower2, Dumbbell, Package, Palette, Music, Camera,
  type LucideIcon,
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
  return <img src={src} alt={alt} loading="lazy" decoding="async" className={`w-full h-full object-cover ${className || ""}`} onError={() => setError(true)} />;
}

const BADGE_LABELS: Record<string, string> = { top: "Top Vendor", trusted: "Trusted", rising: "Rising" };
const BADGE_STYLES: Record<string, string> = {
  top: "bg-amber-50 text-amber-700 border border-amber-200",
  trusted: "bg-teal-50 text-teal-700 border border-teal-200",
  rising: "bg-purple-50 text-purple-700 border border-purple-200",
};

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  fashion: Shirt, "fashion-clothing": Shirt,
  food: UtensilsCrossed, "food-snacks": UtensilsCrossed,
  gadgets: Smartphone, "gadgets-accessories": Smartphone,
  electronics: Monitor, digital: Monitor, "digital-products": Monitor,
  editing: Scissors, hair: Scissors, "hair-beauty": Scissors,
  laundry: WashingMachine,
  perfumes: Flower2, "perfumes-cosmetics": Flower2, cosmetics: Flower2,
  sports: Dumbbell,
  books: BookOpen,
  music: Music, art: Palette, photography: Camera,
  transport: Car, home: Home,
};

function getCategoryIcon(slug: string): LucideIcon {
  const key = slug.toLowerCase();
  for (const [k, icon] of Object.entries(CATEGORY_ICONS)) {
    if (key.includes(k)) return icon;
  }
  return Package;
}

const TRUST_ITEMS = [
  { icon: ShieldCheck, title: "Trusted Vendors", desc: "Verified sellers you can trust" },
  { icon: Zap,         title: "Fast Service",    desc: "Get it done on campus quickly" },
];

const HERO_GRAD = "linear-gradient(135deg,#6D28D9 0%,#4F46E5 45%,#06B6D4 100%)";

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

  const [mounted, setMounted]           = useState(false);
  const [campusReady, setCampusReady]   = useState(false);
  const [toast, setToast]               = useState("");
  const [activeTab, setActiveTab]       = useState<"listings" | "vendors">("listings");

  const [vendors, setVendors]           = useState<Vendor[]>(initialVendors);
  const [allListings, setAllListings]   = useState<any[]>(initialListings);
  const [categories, setCategories]     = useState<Category[]>(initialCategories);
  const [activeFilter, setActiveFilter] = useState("All");
  const [currentCampus, setCurrentCampus] = useState<"pau" | "futo">("pau");

  const [searchQuery, setSearchQuery]     = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching]         = useState(false);
  const [showResults, setShowResults]     = useState(false);

  const featuredRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    const c = document.cookie.split(";").find(s => s.trim().startsWith("studex_campus="))?.split("=")?.[1]?.toLowerCase();
    if (c === "pau" || c === "futo") setCurrentCampus(c);
  }, []);

  const switchCampus = async (campus: "pau" | "futo") => {
    if (campus === currentCampus) return;
    const isHttps = window.location.protocol === "https:";
    document.cookie = `studex_campus=${campus}; path=/; max-age=31536000; SameSite=Lax${isHttps ? "; Secure" : ""}`;
    setCurrentCampus(campus); setCampusReady(false); setActiveFilter("All");
    try {
      const [l, v, c] = await Promise.all([
        fetch(`${API_URL}/api/services/listings/?campus=${campus}&page_size=500`),
        fetch(`${API_URL}/api/auth/vendors/?campus=${campus}`),
        fetch(`${API_URL}/api/services/categories/?campus=${campus}`),
      ]);
      if (l.ok) { const d = await l.json(); setAllListings(d.results || d || []); }
      if (v.ok) { const d = await v.json(); setVendors(d.results || d || []); }
      if (c.ok) { const d = await c.json(); setCategories(d.results || d || []); }
    } catch {} finally { setCampusReady(true); }
  };

  useEffect(() => {
    if (!isHydrated) return;
    if (!isLoggedIn || !user) { setCampusReady(true); return; }
    const school = ((user as any).school || "").toLowerCase();
    if (school !== "pau" && school !== "futo") { setCampusReady(true); return; }
    const cookie = document.cookie.split(";").find(c => c.trim().startsWith("studex_campus="))?.split("=")?.[1]?.toLowerCase() || "pau";
    if (cookie === school) { setCampusReady(true); return; }
    const https = typeof window !== "undefined" && window.location.protocol === "https:";
    document.cookie = `studex_campus=${school}; path=/; max-age=31536000; SameSite=Lax${https ? "; Secure" : ""}`;
    Promise.all([
      fetchWithAuth(`${API_URL}/api/services/listings/?campus=${school}&page_size=500`),
      fetchWithAuth(`${API_URL}/api/auth/vendors/?campus=${school}`),
      fetchWithAuth(`${API_URL}/api/services/categories/?campus=${school}`),
    ]).then(async ([l, v, c]) => {
      if (l.ok) { const d = await l.json(); setAllListings(d.results || d || []); }
      if (v.ok) { const d = await v.json(); setVendors(d.results || d || []); }
      if (c.ok) { const d = await c.json(); setCategories(d.results || d || []); }
    }).catch(() => {}).finally(() => setCampusReady(true));
  }, [isHydrated, isLoggedIn, (user as any)?.school]);

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); setShowResults(false); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const url = `${API_URL}/api/services/listings/?search=${encodeURIComponent(searchQuery)}`;
        const res = isLoggedIn ? await fetchWithAuth(url) : await fetch(url);
        const data = await res.json();
        setSearchResults(data.results || data || []); setShowResults(true);
      } catch { setSearchResults([]); } finally { setSearching(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [searchQuery, isLoggedIn]);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2000); };

  const handleFilter = (f: string) => {
    setActiveFilter(f); setActiveTab("listings");
    setTimeout(() => featuredRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const filteredListings   = activeFilter === "All" ? allListings : allListings.filter(l => l.category === activeFilter);
  const categorySections   = categories.map(cat => ({ ...cat, items: allListings.filter(l => l.category === cat.slug) })).filter(s => s.items.length > 0);
  const categorisedSlugs   = new Set(categories.map(c => c.slug));
  const uncategorised      = allListings.filter(l => !categorisedSlugs.has(l.category));
  const allSections        = uncategorised.length > 0 ? [...categorySections, { id: 0, title: "Other", slug: "__other__", image: null, items: uncategorised }] : categorySections;

  const renderListingCard = (listing: any, i: number) => {
    const badge        = listing.vendor?.profile?.vendor_badge;
    const rating       = listing.vendor?.profile?.rating;
    const totalReviews = listing.vendor?.profile?.total_reviews;
    const wishlisted   = mounted && isInWishlist(listing.id);
    const isService    = (listing.listing_type || "").toLowerCase() === "service";
    const isOwn        = !!(user?.id && user.id === listing.vendor?.id);
    const isReserved   = !isService && !isOwn && !!listing.is_reserved;
    const inCart       = cart.some(ci => ci.id === listing.id);

    return (
      <motion.div key={listing.id} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }} transition={{ delay: Math.min(i * 0.04, 0.2) }}
        className="bg-white rounded-xl border border-stone-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow group">

        <Link href={`/listing/${listing.id}`} className="block">
          <div className="relative w-full aspect-square overflow-hidden bg-stone-50">
            <SafeImage src={listing.image?.startsWith("http") ? listing.image : null} alt={listing.title} />

            {!listing.is_available && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <span className="text-white font-bold bg-red-500 px-3 py-1 rounded-full text-xs">Unavailable</span>
              </div>
            )}

            {badge && badge !== "none" && (
              <div className="absolute top-2.5 left-2.5 z-10 px-2 py-0.5 rounded-md text-[10px] font-bold text-white" style={{ background: GRAD }}>
                {BADGE_LABELS[badge]}
              </div>
            )}

            <motion.button onClick={e => {
              e.preventDefault(); e.stopPropagation();
              const item = { id: listing.id, title: listing.title, price: listing.price, img: listing.image };
              if (wishlisted) { removeFromWishlist(listing.id); showToast("Removed from Wishlist"); }
              else { addToWishlist(item); showToast("Added to Wishlist ❤️"); }
            }} whileTap={{ scale: 0.85 }}
              className="absolute top-2.5 right-2.5 z-10 w-7 h-7 bg-white rounded-full shadow-sm flex items-center justify-center">
              <Heart className={`w-3.5 h-3.5 ${wishlisted ? "fill-red-500 text-red-500" : "text-stone-400"}`} />
            </motion.button>

            {!isOwn && !isService && (
              <motion.button onClick={e => {
                e.preventDefault(); e.stopPropagation();
                addToCart({ id: listing.id, title: listing.title, price: listing.price, img: listing.image || "" });
                showToast(inCart ? "Added again (+1)" : "Added to cart");
              }} whileTap={{ scale: 0.85 }}
                className="absolute bottom-2.5 right-2.5 z-10 w-7 h-7 rounded-full shadow flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: GRAD }}>
                <Plus className="w-3.5 h-3.5 text-white" />
              </motion.button>
            )}
          </div>

          <div className="p-3">
            <p className="font-bold text-stone-900 text-sm line-clamp-1">{listing.title}</p>
            <p className="text-stone-400 text-xs mt-0.5 truncate">@{listing.vendor?.username || listing.vendor}</p>

            {totalReviews > 0 && (
              <div className="flex items-center gap-0.5 mt-1.5">
                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                <span className="text-xs text-stone-600 font-medium">{rating}</span>
                <span className="text-xs text-stone-400">({totalReviews})</span>
              </div>
            )}

            <div className="mt-2 space-y-2">
              <p className="font-bold text-stone-900 text-sm">₦{Number(listing.price).toLocaleString()}</p>
              {isReserved ? (
                <span className="text-[10px] text-stone-400 font-semibold flex items-center gap-0.5">
                  <Clock className="w-3 h-3" /> Reserved
                </span>
              ) : (
                <button
                  onClick={e => {
                    // Services and own listings: let the outer Link navigate to the detail page
                    if (isOwn || isService) return;
                    e.preventDefault(); e.stopPropagation();
                    addToCart({ id: listing.id, title: listing.title, price: listing.price, img: listing.image || "" });
                    showToast(inCart ? "Added again (+1)" : "Added to cart");
                  }}
                  className="w-full py-2 rounded-xl text-white text-xs font-bold flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity"
                  style={{ background: "linear-gradient(135deg,#2DD4BF 0%,#0D9488 100%)" }}>
                  <ShoppingCart className="w-3.5 h-3.5" />
                  {isOwn ? "Manage" : isService ? "Book Now" : "Add to Cart"}
                </button>
              )}
            </div>
          </div>
        </Link>
      </motion.div>
    );
  };

  const renderVendorCard = (vendor: Vendor, i: number) => {
    const src = vendor.username === (user as any)?.username && (user as any)?.profile_image ? (user as any).profile_image : vendor.profile_picture;
    const displaySrc = src?.startsWith("http") ? src : null;
    const initials = (vendor.business_name || vendor.username || "??").slice(0, 2).toUpperCase();
    return (
      <motion.div key={vendor.id} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }} transition={{ delay: Math.min(i * 0.05, 0.3) }}>
        <Link href={`/vendor/${vendor.username}`}>
          <div className="bg-white rounded-xl border border-stone-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow group cursor-pointer">
            <div className="relative w-full aspect-square overflow-hidden bg-stone-50">
              {displaySrc
                ? <img src={displaySrc} alt={vendor.business_name || vendor.username} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                : <div className="absolute inset-0 flex items-center justify-center text-white text-3xl font-black" style={{ background: GRAD }}>{initials}</div>
              }
              {vendor.is_online && (
                <div className="absolute top-2.5 right-2.5 flex items-center gap-1 bg-white/90 px-2 py-0.5 rounded-full shadow-sm">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  <span className="text-[10px] font-semibold text-stone-700">Online</span>
                </div>
              )}
              {vendor.vendor_badge && vendor.vendor_badge !== "none" && (
                <div className="absolute bottom-2.5 left-2.5">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${BADGE_STYLES[vendor.vendor_badge]}`}>{BADGE_LABELS[vendor.vendor_badge]}</span>
                </div>
              )}
            </div>
            <div className="p-3">
              <p className="font-bold text-stone-900 text-sm truncate">{vendor.business_name || vendor.username}</p>
              <p className="text-stone-400 text-xs truncate">@{vendor.username}</p>
              <div className="flex items-center justify-between mt-2">
                {vendor.total_reviews > 0 && (
                  <div className="flex items-center gap-0.5"><Star className="w-3 h-3 fill-amber-400 text-amber-400" /><span className="text-xs text-stone-600 font-medium">{vendor.rating}</span><span className="text-xs text-stone-400">({vendor.total_reviews})</span></div>
                )}
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
          className="fixed top-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full shadow-lg z-50 font-medium text-sm text-white" style={{ background: GRAD }}>
          {toast}
        </motion.div>
      )}

      <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>

        {/* ── HEADER (white, like prototype) ── */}
        <header className="sticky top-0 bg-white z-40 border-b border-stone-200 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">

            <Link href="/home" className="flex items-center gap-2 flex-shrink-0">
              <div className="w-9 h-9 rounded-xl overflow-hidden border border-stone-100 shadow-sm flex items-center justify-center p-1 bg-white">
                <img src="/images/logo-1.jpg" alt="StudEx" loading="lazy" className="w-full h-full object-contain" />
              </div>
              <span className="font-black text-lg text-stone-900 hidden sm:block" style={SERIF}>
                Stud<span className="text-transparent bg-clip-text" style={{ backgroundImage: GRAD }}>Ex</span>
              </span>
            </Link>

            {/* Nav links — desktop */}
            <nav className="hidden lg:flex items-center gap-6 flex-shrink-0">
              <button onClick={() => { setActiveTab("listings"); handleFilter("All"); }}
                className="text-sm font-semibold text-teal-600 border-b-2 border-teal-500 pb-0.5">
                New Arrivals
              </button>
              <button onClick={() => { setActiveTab("listings"); setActiveFilter("All"); setTimeout(() => featuredRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }}
                className="text-sm font-medium text-stone-500 hover:text-stone-700 transition">
                Services
              </button>
              <button onClick={() => { setActiveTab("vendors"); setTimeout(() => featuredRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }}
                className="text-sm font-medium text-stone-500 hover:text-stone-700 transition">
                Vendors
              </button>
            </nav>

            {/* Search */}
            <div className="relative flex-1 max-w-2xl">
              <Search className="w-4 h-4 absolute left-4 top-3 text-stone-400 pointer-events-none" />
              <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                onFocus={() => searchResults.length > 0 && setShowResults(true)}
                onBlur={() => setTimeout(() => setShowResults(false), 200)}
                placeholder="Search for services, vendors and more..."
                className="w-full pl-11 pr-9 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 placeholder:text-stone-400 transition-all" />
              {searchQuery && (
                <button onClick={() => { setSearchQuery(""); setShowResults(false); }} className="absolute right-3 top-3 text-stone-400 hover:text-stone-600">
                  <X className="w-4 h-4" />
                </button>
              )}
              <AnimatePresence>
                {showResults && (
                  <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="absolute top-full mt-2 left-0 right-0 bg-white rounded-2xl shadow-xl border border-stone-100 z-50 overflow-hidden max-h-72 overflow-y-auto">
                    {searching ? <div className="p-4 text-center text-stone-400 text-sm">Searching...</div>
                      : searchResults.length === 0 ? <div className="p-4 text-center text-stone-400 text-sm">No results for "{searchQuery}"</div>
                      : searchResults.map(item => (
                        <Link key={item.id} href={`/listing/${item.id}`} onClick={() => { setShowResults(false); setSearchQuery(""); }}>
                          <div className="flex items-center gap-3 p-3 hover:bg-stone-50 transition border-b border-stone-50 last:border-0 cursor-pointer">
                            <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 bg-stone-50">
                              <SafeImage src={item.image?.startsWith("http") ? item.image : null} alt={item.title} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-stone-900 text-sm truncate">{item.title}</p>
                              <p className="text-xs text-stone-400">@{item.vendor?.username || item.vendor}</p>
                            </div>
                            <p className="font-bold text-sm flex-shrink-0 text-transparent bg-clip-text" style={{ backgroundImage: GRAD }}>₦{Number(item.price).toLocaleString()}</p>
                          </div>
                        </Link>
                      ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Right actions */}
            <div className="flex items-center gap-4 flex-shrink-0">
              {isLoggedIn && user ? (
                <>
                  <Link href="/wishlist" className="hidden lg:flex flex-col items-center gap-0.5 text-stone-500 hover:text-teal-600 transition cursor-pointer">
                    <Heart className="w-5 h-5" />
                    <span className="text-[10px] font-medium">Wishlist</span>
                  </Link>
                  <Link href="/cart" className="hidden lg:flex flex-col items-center gap-0.5 text-stone-500 hover:text-teal-600 transition cursor-pointer relative">
                    <div className="relative">
                      <ShoppingCart className="w-5 h-5" />
                      {cart.length > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 w-4 h-4 text-[9px] font-bold text-white rounded-full flex items-center justify-center" style={{ background: GRAD }}>
                          {cart.length}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-medium">Cart</span>
                  </Link>
                  <Link href="/account/address" className="flex items-center gap-1.5 text-sm text-stone-600 hover:text-teal-600 transition cursor-pointer">
                    <User className="w-4 h-4 text-stone-400" />
                    <span>Hi, <span className="font-semibold text-stone-900">{(user as any).username}</span></span>
                    <ChevronDown className="w-3.5 h-3.5 text-stone-400" />
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/auth" className="hidden lg:flex items-center gap-1.5 text-sm text-stone-600 hover:text-teal-600 font-medium transition">
                    <ShoppingCart className="w-4 h-4" /> Sell on StudEx
                  </Link>
                  <Link href="/auth">
                    <motion.button whileTap={{ scale: 0.97 }}
                      className="px-4 py-2 text-white font-semibold rounded-xl text-sm shadow-sm" style={{ background: GRAD }}>
                      Login
                    </motion.button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </header>

        <div className="max-w-7xl mx-auto px-4 pt-5 pb-32">

          {/* ── HERO ── */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            className="relative rounded-2xl overflow-hidden"
            style={{ background: HERO_GRAD }}>

            {/* Blobs */}
            <div className="absolute top-1/2 left-[45%] -translate-y-1/2 w-80 h-80 rounded-full pointer-events-none"
              style={{ background: "radial-gradient(circle,rgba(165,180,252,0.35) 0%,transparent 70%)" }} />
            <div className="absolute bottom-0 left-[20%] w-56 h-56 rounded-full pointer-events-none"
              style={{ background: "radial-gradient(circle,rgba(103,232,249,0.25) 0%,transparent 70%)" }} />

            <div className="relative z-10 px-4 py-10 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
              {/* Always side-by-side — scaled down on mobile */}
              <div className="flex items-center gap-3 sm:gap-6">

                {/* Text */}
                <div className="flex-1 min-w-0">
                  {vendorOfMonth ? (
                    <>
                      <div className="flex items-center gap-1 bg-amber-400 w-fit px-2 py-0.5 sm:px-3 sm:py-1 rounded-full mb-2 sm:mb-3">
                        <Trophy className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-amber-900" />
                        <span className="text-amber-900 text-[10px] sm:text-xs font-bold">Vendor of the Month · {vendorOfMonth.month}</span>
                      </div>
                      <h1 className="text-lg sm:text-3xl lg:text-5xl font-black text-white leading-[1.1]"
                        style={{ fontFamily: "var(--font-jakarta),'Plus Jakarta Sans',sans-serif" }}>
                        {vendorOfMonth.business_name}
                      </h1>
                      <p className="text-white/50 text-[10px] sm:text-sm mt-0.5 mb-2 sm:mb-3">@{vendorOfMonth.username}</p>

                      {/* Stats row */}
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-3 sm:mb-4">
                        <span className="flex items-center gap-1 bg-white/15 rounded-full px-2 py-0.5 sm:px-3 sm:py-1 text-[10px] sm:text-xs text-white font-semibold">
                          🛒 {vendorOfMonth.total_orders} orders
                        </span>
                        {vendorOfMonth.rating > 0 && (
                          <span className="flex items-center gap-1 bg-white/15 rounded-full px-2 py-0.5 sm:px-3 sm:py-1 text-[10px] sm:text-xs text-white font-semibold">
                            ⭐ {vendorOfMonth.rating.toFixed(1)}
                            {vendorOfMonth.total_reviews > 0 && <span className="text-white/60">({vendorOfMonth.total_reviews})</span>}
                          </span>
                        )}
                        {vendorOfMonth.completion_rate > 0 && (
                          <span className="flex items-center gap-1 bg-white/15 rounded-full px-2 py-0.5 sm:px-3 sm:py-1 text-[10px] sm:text-xs text-white font-semibold">
                            ✅ {Math.round(vendorOfMonth.completion_rate)}% completion
                          </span>
                        )}
                        {vendorOfMonth.vendor_badge && vendorOfMonth.vendor_badge !== "none" && (
                          <span className="flex items-center gap-1 bg-amber-400/90 rounded-full px-2 py-0.5 sm:px-3 sm:py-1 text-[10px] sm:text-xs text-amber-900 font-bold">
                            {vendorOfMonth.vendor_badge === "top" ? "🏆 Top Vendor" : vendorOfMonth.vendor_badge === "trusted" ? "✅ Trusted" : "⭐ Rising"}
                          </span>
                        )}
                      </div>

                      <Link href={`/vendor/${vendorOfMonth.username}`}>
                        <motion.button whileTap={{ scale: 0.97 }}
                          className="bg-white text-stone-900 font-bold px-3 py-1.5 sm:px-6 sm:py-2.5 rounded-full text-[11px] sm:text-sm inline-flex items-center gap-1.5 sm:gap-2 shadow-lg">
                          Shop Now <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4" />
                        </motion.button>
                      </Link>
                    </>
                  ) : (
                    <>
                      <h1 className="text-xl sm:text-3xl lg:text-5xl font-black text-white leading-[1.1] mb-1.5 sm:mb-3"
                        style={{ fontFamily: "var(--font-jakarta),'Plus Jakarta Sans',sans-serif" }}>
                        Shop Smart.<br className="sm:hidden" /> Live Campus.
                      </h1>
                      <p className="text-white/80 text-[11px] sm:text-sm lg:text-base mb-3 sm:mb-4 leading-relaxed line-clamp-2 sm:line-clamp-none">
                        Explore hundreds of services from verified vendors on your campus, every day.
                      </p>
                      <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                        <Link href="/categories">
                          <motion.button whileTap={{ scale: 0.97 }}
                            className="bg-white text-stone-900 font-bold px-3 py-1.5 sm:px-6 sm:py-2.5 rounded-full text-[11px] sm:text-sm inline-flex items-center gap-1 sm:gap-2 shadow-lg">
                            Shop Now <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4" />
                          </motion.button>
                        </Link>
                        <button onClick={() => setActiveTab("vendors")}
                          className="bg-white/20 border border-white/30 text-white font-semibold px-3 py-1.5 sm:px-6 sm:py-2.5 rounded-full text-[11px] sm:text-sm inline-flex items-center gap-1 sm:gap-1.5 backdrop-blur-sm hover:bg-white/30 transition">
                          View Vendors
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Image — always visible, smaller on mobile */}
                <div className="w-28 h-36 sm:w-44 sm:h-56 lg:w-56 lg:h-72 rounded-xl sm:rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20 flex-shrink-0">
                  <img
                    src={vendorOfMonth?.profile_picture || "https://plus.unsplash.com/premium_photo-1681487865280-c2b836dd83e8?fm=jpg&q=80&w=900&auto=format&fit=crop"}
                    alt={vendorOfMonth?.business_name || "Shop on StudEx"}
                    className="w-full h-full object-cover object-top"
                  />
                </div>
              </div>
            </div>
          </motion.div>

          {/* ── CATEGORY TABS ── */}
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
            {[{ slug: "All", title: "All Products" }, ...categories.map(c => ({ slug: c.slug, title: c.title }))].map(tab => (
              <button key={tab.slug} onClick={() => { setActiveTab("listings"); handleFilter(tab.slug); }}
                className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold transition-all border ${activeFilter === tab.slug && activeTab === "listings" ? "text-white shadow-sm border-transparent" : "bg-white text-stone-500 border-stone-200 hover:border-stone-300"}`}
                style={activeFilter === tab.slug && activeTab === "listings" ? { background: GRAD } : {}}>
                {tab.title}
              </button>
            ))}
          </div>
          {mounted && (!isLoggedIn || !(user as any)?.school) && (
            <div className="flex items-center gap-2 mt-3">
              <span className="text-[11px] text-stone-400 font-medium">Campus:</span>
              {(["pau", "futo"] as const).map(c => (
                <button key={c} onClick={() => switchCampus(c)}
                  className={`px-3 py-1 rounded-full text-xs font-bold uppercase transition ${currentCampus === c ? "text-white" : "bg-white text-stone-500 border border-stone-200"}`}
                  style={currentCampus === c ? { background: GRAD } : {}}>
                  {c}
                </button>
              ))}
            </div>
          )}

          {/* ── TRUST BAR ── */}
          <div className="mt-4 bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="grid grid-cols-2 divide-x divide-stone-100">
              {TRUST_ITEMS.map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex items-center gap-3 px-5 py-4">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-teal-50 border border-teal-100">
                    <Icon className="w-5 h-5 text-teal-600" />
                  </div>
                  <div>
                    <p className="font-bold text-stone-900 text-sm">{title}</p>
                    <p className="text-stone-400 text-xs mt-0.5 leading-snug">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── FEATURED SECTION ── */}
          <div className="mt-8" ref={featuredRef}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
              <div>
                <h2 className="text-xl font-bold text-stone-900">
                  {activeTab === "listings"
                    ? activeFilter === "All" ? "Featured Services" : categories.find(c => c.slug === activeFilter)?.title || activeFilter
                    : "Campus Vendors"}
                </h2>
                <p className="text-stone-400 text-sm mt-0.5">
                  {activeTab === "listings" ? "Selected by our team for you." : "Verified campus vendors."}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {/* Tab switcher */}
                <div className="flex bg-stone-100 rounded-full p-1">
                  {(["listings", "vendors"] as const).map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                      className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all capitalize ${activeTab === tab ? "bg-white text-stone-900 shadow-sm" : "text-stone-500"}`}>
                      {tab === "listings" ? "Listings" : "Vendors"}
                    </button>
                  ))}
                </div>
                <button onClick={() => handleFilter("All")}
                  className="text-teal-600 text-sm font-semibold flex items-center gap-1 hover:text-teal-700 transition">
                  View All <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Listings */}
            {activeTab === "listings" && (
              <>
                {mounted && !campusReady ? (
                  <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {[0,1,2,3,4].map(i => (
                      <div key={i} className="bg-white rounded-xl border border-stone-100 overflow-hidden animate-pulse">
                        <div className="aspect-square bg-stone-100" />
                        <div className="p-3 space-y-2">
                          <div className="h-3 bg-stone-100 rounded w-3/4" />
                          <div className="h-2.5 bg-stone-100 rounded w-1/2" />
                          <div className="h-4 bg-stone-100 rounded w-1/3" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : activeFilter === "All" ? (
                  allListings.length === 0 ? (
                    <div className="bg-white rounded-2xl p-16 text-center border border-stone-100 shadow-sm">
                      <Sparkles className="w-12 h-12 text-stone-200 mx-auto mb-3" />
                      <h3 className="text-lg font-bold text-stone-400">No listings yet</h3>
                      <p className="text-stone-400 text-sm mt-1">Check back soon!</p>
                    </div>
                  ) : (
                    <div className="space-y-10">
                      {allSections.map(section => (
                        <div key={section.slug}>
                          <div className="flex items-center justify-between mb-4">
                            <div>
                              <p className="text-teal-600 text-xs tracking-widest uppercase font-bold">{section.items.length} listing{section.items.length !== 1 ? "s" : ""}</p>
                              <h3 className="text-lg font-bold text-stone-900 mt-0.5">{section.title}</h3>
                            </div>
                            {section.slug !== "__other__" && (
                              <button onClick={() => handleFilter(section.slug)} className="text-teal-600 text-sm font-semibold flex items-center gap-1">
                                View All <ChevronRight className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                          <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                            {section.items.map((l, i) => renderListingCard(l, i))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  <>
                    {filteredListings.length === 0 ? (
                      <div className="bg-white rounded-2xl p-16 text-center border border-stone-100 shadow-sm">
                        <Sparkles className="w-12 h-12 text-stone-200 mx-auto mb-3" />
                        <h3 className="text-lg font-bold text-stone-400">Nothing here yet</h3>
                        <p className="text-stone-400 text-sm mt-1">No listings in this category.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                        {filteredListings.map((l, i) => renderListingCard(l, i))}
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {/* Vendors */}
            {activeTab === "vendors" && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                {vendors.length === 0 ? (
                  <div className="bg-white rounded-2xl p-16 text-center border border-stone-100 shadow-sm">
                    <Sparkles className="w-12 h-12 text-stone-200 mx-auto mb-3" />
                    <h3 className="text-lg font-bold text-stone-400">No vendors yet</h3>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {vendors.map((v, i) => renderVendorCard(v, i))}
                  </div>
                )}
              </motion.div>
            )}
          </div>

          {/* ── CTA BANNER ── */}
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="mt-10 rounded-2xl overflow-hidden" style={{ background: HERO_GRAD }}>
            <div className="px-6 lg:px-10 py-8 lg:py-10 flex flex-col sm:flex-row items-center justify-between gap-5">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                  <Tag className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-white font-black text-xl">{isLoggedIn ? "Keep Exploring" : "Become a Vendor"}</p>
                  <p className="text-white/70 text-sm mt-0.5">
                    {isLoggedIn ? "Discover hundreds of campus services." : "Join our marketplace and start selling to students on campus."}
                  </p>
                </div>
              </div>
              <Link href={isLoggedIn ? "/categories" : "/auth"} className="flex-shrink-0">
                <motion.button whileTap={{ scale: 0.97 }}
                  className="bg-white text-stone-900 font-bold px-6 py-3 rounded-full text-sm inline-flex items-center gap-2 shadow-md">
                  {isLoggedIn ? "Shop Now" : "Start Selling"} <ArrowRight className="w-4 h-4" />
                </motion.button>
              </Link>
            </div>
          </motion.div>

        </div>
      </div>
    </>
  );
}
