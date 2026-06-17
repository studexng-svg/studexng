"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search, ArrowRight, Heart, X, Sparkles, Star,
  ChevronRight, ChevronDown, Clock, Plus, Trophy, ShoppingCart, User, LayoutGrid, List, GalleryHorizontal, MapPin,
  Share2, ShieldCheck, Tag, Zap, Headphones,
  Shirt, Monitor, Home, BookOpen, Car,
  UtensilsCrossed, Smartphone, Scissors, WashingMachine,
  Flower2, Dumbbell, Package, Palette, Music, Camera,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/authStore";
import { api } from "@/lib/api";
import { useWishlistStore } from "@/lib/wishlistStore";
import { useCart } from "@/lib/cartStore";
import { GRAD, GRAD_TEXT, SERIF } from "@/lib/tokens";
import VendorOfMonthModal from "@/components/VendorOfMonthModal";
import WhatsAppGroupModal from "@/components/WhatsAppGroupModal";


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
  completed_order_count?: number;
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

const heroBackgrounds = [
  { type: "gradient", value: "linear-gradient(135deg,#6D28D9 0%,#4F46E5 45%,#06B6D4 100%)" },
  // Nails / nail art
  { type: "image", value: "https://images.unsplash.com/photo-1604654894610-df63bc536371?w=1200&q=80" },
  // Lashes / eye makeup close-up
  { type: "image", value: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=1200&q=80" },
  // Hair styling / braiding
  { type: "image", value: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=1200&q=80" },
  // Food — jollof rice / Nigerian cuisine
  { type: "image", value: "https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=1200&q=80" },
  // Drinks / beverages
  { type: "image", value: "https://images.unsplash.com/photo-1546171753-97d7676e4602?w=1200&q=80" },
  // Laundry / clothing
  { type: "image", value: "https://images.unsplash.com/photo-1582735689369-4fe89db7114c?w=1200&q=80" },
  // Fashion / outfit
  { type: "image", value: "https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=1200&q=80" },
  // Photography / camera
  { type: "image", value: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=1200&q=80" },
  // Makeup / beauty
  { type: "image", value: "https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?w=1200&q=80" },
  // Fitness / gym
  { type: "image", value: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=1200&q=80" },
];

interface Props {
  initialVendors: Vendor[];
  initialListings: any[];
  initialCategories: Category[];
  vendorOfMonth?: any;
  initialDeals?: any[];
}

export default function HomePageClient({ initialVendors, initialListings, initialCategories, vendorOfMonth = null, initialDeals = [] }: Props) {
  const { isLoggedIn, user, isHydrated } = useAuth();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlistStore();
  const { addToCart, cart } = useCart();
  const router = useRouter();

  const [mounted, setMounted]           = useState(false);
  const [campusReady, setCampusReady]   = useState(initialListings.length > 0);
  const [dealsReady, setDealsReady]     = useState(false);
  const [toast, setToast]               = useState("");
  const [activeTab, setActiveTab]       = useState<"listings" | "vendors">("listings");
  const [minPrice, setMinPrice]         = useState<string>("");
  const [maxPrice, setMaxPrice]         = useState<string>("");
  const [heroIndex, setHeroIndex]       = useState(0);
  const [viewMode, setViewMode]         = useState<"grid" | "list" | "scroll">("grid");
  const [deals, setDeals]               = useState<any[]>([]);

  const fetchDeals = useCallback(async (campus: string) => {
    try {
      const res = await api.pub.deals(campus);
      if (res.ok) { const d = await res.json(); setDeals(Array.isArray(d) ? d : []); }
    } catch {}
    finally { setDealsReady(true); }
  }, []);

  const [vendors, setVendors]           = useState<Vendor[]>(initialVendors);
  const [allListings, setAllListings]   = useState<any[]>(initialListings);
  const [categories, setCategories]     = useState<Category[]>(initialCategories);
  const [activeFilter, setActiveFilter] = useState("All");
  const [currentCampus, setCurrentCampus] = useState<"pau" | "futo" | "imsu">("pau");

  const [searchQuery, setSearchQuery]     = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching]         = useState(false);
  const [showResults, setShowResults]     = useState(false);

  const featuredRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<"listings" | "vendors">("listings");
  const activeFilterRef = useRef<string>("All");

  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(() => { activeFilterRef.current = activeFilter; }, [activeFilter]);

  useEffect(() => {
    setMounted(true);
    const c = document.cookie.split(";").find(s => s.trim().startsWith("studex_campus="))?.split("=")?.[1]?.toLowerCase();
    if (c === "pau" || c === "futo" || c === "imsu") setCurrentCampus(c as "pau" | "futo" | "imsu");

    // Restore tab + scroll after back navigation from a vendor/listing page
    const saved = sessionStorage.getItem("home_page_state");
    if (saved) {
      try {
        const { scrollY, tab, filter } = JSON.parse(saved);
        if (tab === "vendors") setActiveTab("vendors");
        if (filter && filter !== "All") setActiveFilter(filter);
        if (typeof scrollY === "number" && scrollY > 0) {
          requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, scrollY)));
        }
      } catch {}
      sessionStorage.removeItem("home_page_state");
    } else if (window.location.hash === "#vendors") {
      setActiveTab("vendors");
      setTimeout(() => featuredRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 200);
    }

    // Save state before navigating deeper (vendor pages, listings)
    const handleClick = (e: MouseEvent) => {
      const link = (e.target as Element).closest("a");
      const href = link?.getAttribute("href") ?? "";
      if (href.startsWith("/vendor/") || href.startsWith("/listing/")) {
        sessionStorage.setItem("home_page_state", JSON.stringify({
          scrollY: window.scrollY,
          tab: activeTabRef.current,
          filter: activeFilterRef.current,
        }));
      }
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setHeroIndex(p => (p + 1) % heroBackgrounds.length), 4000);
    return () => clearInterval(t);
  }, []);

  const switchCampus = async (campus: "pau" | "futo" | "imsu") => {
    if (campus === currentCampus) return;
    const isHttps = window.location.protocol === "https:";
    document.cookie = `studex_campus=${campus}; path=/; max-age=31536000; SameSite=Lax${isHttps ? "; Secure" : ""}`;
    setCurrentCampus(campus); setCampusReady(false); setActiveFilter("All");
    try {
      const [l, v, c] = await Promise.all([
        api.pub.listings({ campus, page_size: "100" }),
        api.pub.vendors({ campus, page_size: "100" }),
        api.pub.categories({ campus }),
      ]);
      if (l.ok) { const d = await l.json(); setAllListings(d.results || d || []); }
      if (v.ok) { const d = await v.json(); setVendors(d.results || d || []); }
      if (c.ok) { const d = await c.json(); setCategories(d.results || d || []); }
    } catch {} finally { setCampusReady(true); fetchDeals(campus); }
  };

  useEffect(() => {
    if (!isHydrated) return;
    const cookieCampus = document.cookie.split(";").find(c => c.trim().startsWith("studex_campus="))?.split("=")?.[1]?.toLowerCase() || "pau";
    if (!isLoggedIn || !user) { setCampusReady(true); fetchDeals(cookieCampus); return; }
    let school = ((user as any).school || "").toLowerCase();
    // Fallback: infer school from email domain if not set in profile
    if (!school && user.email) {
      const emailLower = user.email.toLowerCase();
      if (emailLower.includes("@pau.edu.ng")) school = "pau";
      else if (emailLower.includes("@futo.edu.ng")) school = "futo";
      else if (emailLower.includes("@imsu.edu.ng")) school = "imsu";
    }
    if (school !== "pau" && school !== "futo" && school !== "imsu") { setCampusReady(true); fetchDeals(cookieCampus); return; }
    const cookie = cookieCampus;
    if (cookie === school) { setCampusReady(true); fetchDeals(school); return; }
    const https = typeof window !== "undefined" && window.location.protocol === "https:";
    document.cookie = `studex_campus=${school}; path=/; max-age=31536000; SameSite=Lax${https ? "; Secure" : ""}`;
    Promise.all([
      api.pub.listings({ campus: school, page_size: "100" }),
      api.pub.vendors({ campus: school, page_size: "100" }),
      api.pub.categories({ campus: school }),
    ]).then(async ([l, v, c]) => {
      if (l.ok) { const d = await l.json(); setAllListings(d.results || d || []); }
      if (v.ok) { const d = await v.json(); setVendors(d.results || d || []); }
      if (c.ok) { const d = await c.json(); setCategories(d.results || d || []); }
    }).catch(() => {}).finally(() => { setCampusReady(true); fetchDeals(school); });
  }, [isHydrated, isLoggedIn, (user as any)?.school, fetchDeals]);

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); setShowResults(false); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.pub.listings({ search: searchQuery, page_size: "20", campus: currentCampus });
        const data = await res.json();
        setSearchResults(data.results || data || []); setShowResults(true);
      } catch { setSearchResults([]); } finally { setSearching(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [searchQuery, currentCampus]);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2000); };

  const handleFilter = (f: string) => {
    setActiveFilter(f); setActiveTab("listings");
    setTimeout(() => featuredRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const priceMin = minPrice ? Number(minPrice) : null;
  const priceMax = maxPrice ? Number(maxPrice) : null;
  const applyPriceFilter = (listings: any[]) => {
    if (!priceMin && !priceMax) return listings;
    return listings.filter(l => {
      const p = Number(l.price);
      if (priceMin && p < priceMin) return false;
      if (priceMax && p > priceMax) return false;
      return true;
    });
  };

  const renderListingRow = (listing: any, i: number) => {
    const rating       = listing.vendor?.profile?.rating;
    const totalReviews = listing.vendor?.profile?.total_reviews;
    const wishlisted   = mounted && isInWishlist(listing.id);
    const isService    = (listing.listing_type || "").toLowerCase() === "service";
    const isOwn        = !!(user?.id && user.id === listing.vendor?.id);
    const isReserved   = !isService && !isOwn && !!listing.is_reserved;
    const inCart       = cart.some(ci => ci.id === listing.id);
    return (
      <div key={listing.id} className="animate-fadeUp bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow flex items-center gap-4 p-4"
        style={{ animationDelay: `${Math.min(i * 0.02, 0.1)}s` }}>
        <Link href={`/listing/${listing.id}`} className="flex items-center gap-4 flex-1 min-w-0">
          <div className="w-24 h-24 rounded-xl overflow-hidden flex-shrink-0 bg-stone-50 relative">
            <SafeImage src={listing.image?.startsWith("http") ? listing.image : null} alt={listing.title} />
            {!listing.is_available && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <span className="text-white text-xs font-bold">Unavailable</span>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-stone-900 text-base truncate">{listing.title}</p>
            <p className="text-stone-400 text-sm mt-0.5 truncate">@{listing.vendor?.username || listing.vendor}</p>
            {listing.vendor?.hostel && (
              <div className="flex items-center gap-0.5 mt-0.5">
                <MapPin className="w-3.5 h-3.5 text-teal-400 flex-shrink-0" />
                <span className="text-sm text-stone-400 truncate">{listing.vendor.hostel}</span>
              </div>
            )}
            {(totalReviews ?? 0) > 0 && (
              <div className="flex items-center gap-1 mt-1.5">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                <span className="text-sm text-stone-600 font-medium">{rating}</span>
                <span className="text-sm text-stone-400">({totalReviews})</span>
              </div>
            )}
            <p className="font-bold text-stone-900 text-base mt-1.5">₦{Number(listing.price).toLocaleString()}</p>
          </div>
        </Link>
        {!isOwn && listing.is_available && !isReserved && (
          <button
            onClick={() => {
              if (!isService) {
                addToCart({ id: listing.id, title: listing.title, price: listing.price, img: listing.image || "" });
                showToast(inCart ? "Added again (+1)" : "Added to cart");
              } else {
                router.push(`/listing/${listing.id}`);
              }
            }}
            className="flex-shrink-0 px-4 py-3 text-white text-sm font-bold rounded-xl"
            style={{
              background: "linear-gradient(135deg, #2DD4BF 0%, #0D9488 55%, #0f766e 100%)",
              boxShadow: "0 4px 12px rgba(13,148,136,0.35), inset 0 1px 0 rgba(255,255,255,0.25)",
            }}
          >
            {isService ? "Book" : "Cart"}
          </button>
        )}
      </div>
    );
  };

  const gridClass = viewMode === "grid"
    ? "grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4"
    : viewMode === "scroll"
    ? "flex gap-3 overflow-x-auto pb-2 -mx-4 px-4"
    : "space-y-2";
  const gridStyle: React.CSSProperties = viewMode === "scroll"
    ? { scrollbarWidth: "none", msOverflowStyle: "none" }
    : {};
  const renderItem = (l: any, i: number) =>
    viewMode === "list" ? renderListingRow(l, i) :
    viewMode === "scroll" ? <div key={l.id} className="flex-shrink-0 w-44">{renderListingCard(l, i)}</div> :
    renderListingCard(l, i);

  const catSlug = (l: any) => (typeof l.category === "object" ? l.category?.slug : l.category) ?? "";

  // Only admin-curated deals pull a listing out of its category section.
  // Vendor-discounted listings stay in their category AND appear in Hot Deals.
  const adminDealIds = new Set(
    deals.filter((d: any) => d.source === 'admin').map((d: any) => d.listing?.id).filter(Boolean)
  );
  const nonDealListings = allListings.filter(l => !adminDealIds.has(l.id));

  const filteredListings   = applyPriceFilter(activeFilter === "All" ? nonDealListings : nonDealListings.filter(l => catSlug(l) === activeFilter));
  const SEVENTY_TWO_HOURS  = 72 * 60 * 60 * 1000;
  const newArrivals        = applyPriceFilter(nonDealListings.filter(l => Date.now() - new Date(l.created_at).getTime() < SEVENTY_TWO_HOURS));
  const newArrivalIds      = new Set(newArrivals.map(l => l.id));
  const olderListings      = applyPriceFilter(nonDealListings.filter(l => !newArrivalIds.has(l.id)));

  const categorySections   = categories.map(cat => ({ ...cat, items: olderListings.filter(l => catSlug(l) === cat.slug) })).filter(s => s.items.length > 0);
  const categorisedSlugs   = new Set(categories.map(c => c.slug));
  const uncategorised      = olderListings.filter(l => !categorisedSlugs.has(catSlug(l)));
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
    const discountPct  = listing.discount_percent || 0;
    const effectivePrice = discountPct > 0
      ? Math.round(Number(listing.price) * (1 - discountPct / 100))
      : Number(listing.price);

    return (
      <div key={listing.id} className="animate-fadeUp bg-white rounded-xl border border-stone-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow group"
        style={{ animationDelay: `${Math.min(i * 0.04, 0.2)}s` }}>

        <Link href={`/listing/${listing.id}`} className="block">
          <div className="relative w-full aspect-square overflow-hidden bg-stone-50">
            <SafeImage src={listing.image?.startsWith("http") ? listing.image : null} alt={listing.title} />

            {!listing.is_available && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <span className="text-white font-bold bg-red-500 px-3 py-1 rounded-full text-xs">Unavailable</span>
              </div>
            )}

            {discountPct > 0 ? (
              <div className="absolute top-2.5 left-2.5 z-10 bg-red-500 text-white px-2 py-0.5 rounded-md text-xs font-black">
                -{discountPct}% OFF
              </div>
            ) : badge && badge !== "none" ? (
              <div className="absolute top-2.5 left-2.5 z-10 px-2 py-0.5 rounded-md text-xs font-bold text-white" style={{ background: GRAD }}>
                {BADGE_LABELS[badge]}
              </div>
            ) : null}

            <motion.button onClick={e => {
              e.preventDefault(); e.stopPropagation();
              const item = { id: listing.id, title: listing.title, price: effectivePrice, img: listing.image };
              if (wishlisted) { removeFromWishlist(listing.id); showToast("Removed from Wishlist"); }
              else { addToWishlist(item); showToast("Added to Wishlist ❤️"); }
            }} whileTap={{ scale: 0.85 }}
              className="absolute top-2.5 right-2.5 z-10 w-7 h-7 bg-white rounded-full shadow-sm flex items-center justify-center">
              <Heart className={`w-3.5 h-3.5 ${wishlisted ? "fill-red-500 text-red-500" : "text-stone-400"}`} />
            </motion.button>

          </div>

          <div className="p-3">
            <p className="font-bold text-stone-900 text-sm line-clamp-1">{listing.title}</p>
            <p className="text-stone-400 text-xs mt-0.5 truncate">@{listing.vendor?.username || listing.vendor}</p>
            {listing.vendor?.hostel && (
              <div className="flex items-center gap-0.5 mt-0.5">
                <MapPin className="w-3 h-3 text-teal-400 flex-shrink-0" />
                <span className="text-xs text-stone-400 truncate">{listing.vendor.hostel}</span>
              </div>
            )}

            {totalReviews > 0 && (
              <div className="flex items-center gap-0.5 mt-1.5">
                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                <span className="text-xs text-stone-600 font-medium">{rating}</span>
                <span className="text-xs text-stone-400">({totalReviews})</span>
              </div>
            )}

            <div className="mt-2 space-y-2">
              {discountPct > 0 ? (
                <div className="flex items-center gap-1.5">
                  <p className="font-bold text-stone-400 text-xs line-through">₦{Number(listing.price).toLocaleString()}</p>
                  <p className="font-bold text-red-600 text-sm">₦{effectivePrice.toLocaleString()}</p>
                </div>
              ) : (
                <p className="font-bold text-stone-900 text-sm">₦{Number(listing.price).toLocaleString()}</p>
              )}
              {isReserved ? (
                <span className="text-xs text-stone-400 font-semibold flex items-center gap-0.5">
                  <Clock className="w-3 h-3" /> Reserved
                </span>
              ) : (
                <div className="flex gap-1.5">
                  <button
                    onClick={e => {
                      if (isOwn) {
                        e.preventDefault(); e.stopPropagation();
                        router.push('/vendor/dashboard/listings');
                        return;
                      }
                      if (isService) return;
                      e.preventDefault(); e.stopPropagation();
                      addToCart({
                        id: listing.id, title: listing.title,
                        price: effectivePrice,
                        original_price: discountPct > 0 ? Number(listing.price) : undefined,
                        deal_discount_percent: discountPct > 0 ? discountPct : undefined,
                        img: listing.image || "",
                      });
                      showToast(inCart ? "Added again (+1)" : "Added to cart");
                    }}
                    className="flex-1 py-2 rounded-xl text-white text-xs font-bold flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity"
                    style={{ background: "linear-gradient(135deg,#2DD4BF 0%,#0D9488 100%)" }}>
                    <ShoppingCart className="w-3.5 h-3.5" />
                    {isOwn ? "Manage" : isService ? "Book Now" : "Add to Cart"}
                  </button>
                  <button
                    onClick={async e => {
                      e.preventDefault(); e.stopPropagation();
                      const url = `${window.location.origin}/listing/${listing.id}`;
                      if (navigator.share) {
                        await navigator.share({ title: listing.title, url }).catch(() => {});
                      } else {
                        await navigator.clipboard.writeText(url);
                        showToast("Link copied!");
                      }
                    }}
                    className="p-2 rounded-xl bg-stone-100 hover:bg-stone-200 transition flex items-center justify-center flex-shrink-0"
                  >
                    <Share2 className="w-3.5 h-3.5 text-stone-500" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </Link>
      </div>
    );
  };

  const renderDealCard = (deal: any, i: number) => {
    const listing     = deal.listing;
    const badge        = listing.vendor?.profile?.vendor_badge;
    const rating       = listing.vendor?.profile?.rating;
    const totalReviews = listing.vendor?.profile?.total_reviews;
    const wishlisted   = mounted && isInWishlist(listing.id);
    const isService    = (listing.listing_type || "").toLowerCase() === "service";
    const isOwn        = !!(user?.id && user.id === listing.vendor?.id);
    const isReserved   = !isService && !isOwn && !!listing.is_reserved;
    const inCart       = cart.some(ci => ci.id === listing.id);
    const dealPrice    = Number(deal.discounted_price);

    return (
      <div key={listing.id} className="animate-fadeUp bg-white rounded-xl border border-stone-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow group relative"
        style={{ animationDelay: `${Math.min(i * 0.04, 0.2)}s` }}>

        {/* Discount badge */}
        <div className="absolute top-2.5 left-2.5 z-20 bg-red-500 text-white px-2 py-0.5 rounded-md text-xs font-black">
          -{deal.discount_percent}% OFF
        </div>

        <Link href={`/listing/${listing.id}`} className="block">
          <div className="relative w-full aspect-square overflow-hidden bg-stone-50">
            <SafeImage src={listing.image?.startsWith("http") ? listing.image : null} alt={listing.title} />

            {!listing.is_available && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <span className="text-white font-bold bg-red-500 px-3 py-1 rounded-full text-xs">Unavailable</span>
              </div>
            )}

            {badge && badge !== "none" && (
              <div className="absolute top-2.5 left-2.5 z-10 px-2 py-0.5 rounded-md text-xs font-bold text-white mt-6" style={{ background: GRAD }}>
                {BADGE_LABELS[badge]}
              </div>
            )}

            <motion.button onClick={e => {
              e.preventDefault(); e.stopPropagation();
              const item = { id: listing.id, title: listing.title, price: dealPrice, img: listing.image };
              if (wishlisted) { removeFromWishlist(listing.id); showToast("Removed from Wishlist"); }
              else { addToWishlist(item); showToast("Added to Wishlist ❤️"); }
            }} whileTap={{ scale: 0.85 }}
              className="absolute top-2.5 right-2.5 z-10 w-7 h-7 bg-white rounded-full shadow-sm flex items-center justify-center">
              <Heart className={`w-3.5 h-3.5 ${wishlisted ? "fill-red-500 text-red-500" : "text-stone-400"}`} />
            </motion.button>
          </div>

          <div className="p-3">
            <p className="font-bold text-stone-900 text-sm line-clamp-1">{listing.title}</p>
            <p className="text-stone-400 text-xs mt-0.5 truncate">@{listing.vendor?.username || listing.vendor}</p>
            {listing.vendor?.hostel && (
              <div className="flex items-center gap-0.5 mt-0.5">
                <MapPin className="w-3 h-3 text-teal-400 flex-shrink-0" />
                <span className="text-xs text-stone-400 truncate">{listing.vendor.hostel}</span>
              </div>
            )}

            {totalReviews > 0 && (
              <div className="flex items-center gap-0.5 mt-1.5">
                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                <span className="text-xs text-stone-600 font-medium">{rating}</span>
                <span className="text-xs text-stone-400">({totalReviews})</span>
              </div>
            )}

            <div className="mt-2 space-y-2">
              <div className="flex items-center gap-1.5">
                <p className="font-bold text-stone-400 text-xs line-through">₦{Number(listing.price).toLocaleString()}</p>
                <p className="font-bold text-red-600 text-sm">₦{dealPrice.toLocaleString()}</p>
              </div>
              {isReserved ? (
                <span className="text-xs text-stone-400 font-semibold flex items-center gap-0.5">
                  <Clock className="w-3 h-3" /> Reserved
                </span>
              ) : (
                <div className="flex gap-1.5">
                  <button
                    onClick={e => {
                      if (isOwn) {
                        e.preventDefault(); e.stopPropagation();
                        router.push('/vendor/dashboard/listings');
                        return;
                      }
                      if (isService) return;
                      e.preventDefault(); e.stopPropagation();
                      addToCart({ id: listing.id, title: listing.title, price: dealPrice, img: listing.image || "" });
                      showToast(inCart ? "Added again (+1)" : "Added to cart");
                    }}
                    className="flex-1 py-2 rounded-xl text-white text-xs font-bold flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity"
                    style={{ background: "linear-gradient(135deg,#2DD4BF 0%,#0D9488 100%)" }}>
                    <ShoppingCart className="w-3.5 h-3.5" />
                    {isOwn ? "Manage" : isService ? "Book Now" : inCart ? "In Cart" : "Add to Cart"}
                  </button>
                  <button
                    onClick={async e => {
                      e.preventDefault(); e.stopPropagation();
                      const url = `${window.location.origin}/listing/${listing.id}`;
                      if (navigator.share) {
                        await navigator.share({ title: listing.title, url }).catch(() => {});
                      } else {
                        await navigator.clipboard.writeText(url);
                        showToast("Link copied!");
                      }
                    }}
                    className="p-2 rounded-xl bg-stone-100 hover:bg-stone-200 transition flex items-center justify-center flex-shrink-0"
                  >
                    <Share2 className="w-3.5 h-3.5 text-stone-500" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </Link>
      </div>
    );
  };

  const renderVendorCard = (vendor: Vendor, i: number) => {
    const src = vendor.username === (user as any)?.username && (user as any)?.profile_image ? (user as any).profile_image : vendor.profile_picture;
    const displaySrc = src?.startsWith("http") ? src : null;
    const initials = (vendor.business_name || vendor.username || "??").slice(0, 2).toUpperCase();
    return (
      <div key={vendor.id} className="animate-fadeUp" style={{ animationDelay: `${Math.min(i * 0.05, 0.3)}s` }}>
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
                  <span className="text-xs font-semibold text-stone-700">Online</span>
                </div>
              )}
              {vendor.vendor_badge && vendor.vendor_badge !== "none" && (
                <div className="absolute bottom-2.5 left-2.5">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${BADGE_STYLES[vendor.vendor_badge]}`}>{BADGE_LABELS[vendor.vendor_badge]}</span>
                </div>
              )}
            </div>
            <div className="p-3">
              <div className="flex items-start justify-between gap-1">
                <div className="min-w-0">
                  <p className="font-bold text-stone-900 text-sm truncate">{vendor.business_name || vendor.username}</p>
                  <p className="text-stone-400 text-xs truncate">@{vendor.username}</p>
                </div>
                {vendor.vendor_badge && vendor.vendor_badge !== "none" && (
                  <span className={`flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-full ${BADGE_STYLES[vendor.vendor_badge]}`}>
                    {vendor.vendor_badge === "top" ? "🏆" : vendor.vendor_badge === "trusted" ? "✅" : "⭐"} {BADGE_LABELS[vendor.vendor_badge]}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between mt-2">
                {vendor.total_reviews > 0 && (
                  <div className="flex items-center gap-0.5"><Star className="w-3 h-3 fill-amber-400 text-amber-400" /><span className="text-xs text-stone-600 font-medium">{vendor.rating}</span><span className="text-xs text-stone-400">({vendor.total_reviews})</span></div>
                )}
                <span className="text-xs text-stone-400">{vendor.total_listings} listings</span>
              </div>
            </div>
          </div>
        </Link>
      </div>
    );
  };

  return (
    <>
      <VendorOfMonthModal vendor={vendorOfMonth} />
      <WhatsAppGroupModal />

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
              <Link href="/categories" className="text-sm font-medium text-stone-500 hover:text-stone-700 transition">
                Explore
              </Link>
              <button onClick={() => { setActiveTab("vendors"); setTimeout(() => featuredRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }}
                className="text-sm font-medium text-stone-500 hover:text-stone-700 transition">
                Vendors
              </button>
              <Link href="/leaderboard" className="text-sm font-medium text-stone-500 hover:text-stone-700 transition flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5 text-amber-500" /> Leaderboard
              </Link>
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
                    <span className="text-xs font-medium">Wishlist</span>
                  </Link>
                  <Link href="/cart" className="hidden lg:flex flex-col items-center gap-0.5 text-stone-500 hover:text-teal-600 transition cursor-pointer relative">
                    <div className="relative">
                      <ShoppingCart className="w-5 h-5" />
                      {cart.length > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 w-4 h-4 text-xs font-bold text-white rounded-full flex items-center justify-center" style={{ background: GRAD }}>
                          {cart.length}
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-medium">Cart</span>
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
            className="relative rounded-2xl overflow-hidden bg-purple-900">

            {/* Carousel backgrounds */}
            {heroBackgrounds.map((bg, i) =>
              bg.type === "gradient" ? (
                <div
                  key={i}
                  className="absolute inset-0 transition-opacity duration-1000"
                  style={{ opacity: i === heroIndex ? 1 : 0, background: bg.value }}
                />
              ) : (
                <img
                  key={i}
                  src={bg.value}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 w-full h-full object-cover transition-opacity duration-1000"
                  style={{ opacity: i === heroIndex ? 1 : 0, objectPosition: 'center' }}
                />
              )
            )}

            {/* Dark overlay for image slides so text stays readable */}
            <div
              className="absolute inset-0 transition-opacity duration-1000 pointer-events-none"
              style={{
                opacity: heroBackgrounds[heroIndex]?.type === "image" ? 1 : 0,
                background: "linear-gradient(135deg,rgba(109,40,217,0.80) 0%,rgba(79,70,229,0.70) 45%,rgba(6,182,212,0.55) 100%)",
              }}
            />

            {/* Decorative blobs — visible on gradient slide */}
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
                        <span className="text-amber-900 text-xs sm:text-xs font-bold">Vendor of the Month · {vendorOfMonth.month}</span>
                      </div>
                      <h1 className="text-lg sm:text-3xl lg:text-5xl font-black text-white leading-[1.1]"
                        style={{ fontFamily: "var(--font-jakarta),'Plus Jakarta Sans',sans-serif" }}>
                        {vendorOfMonth.business_name}
                      </h1>
                      <p className="text-white/50 text-xs sm:text-sm mt-0.5 mb-2 sm:mb-3">@{vendorOfMonth.username}</p>

                      {/* Stats row */}
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-3 sm:mb-4">
                        <span className="flex items-center gap-1 bg-white/15 rounded-full px-2 py-0.5 sm:px-3 sm:py-1 text-xs sm:text-xs text-white font-semibold">
                          🛒 {vendorOfMonth.total_orders} orders
                        </span>
                        {vendorOfMonth.rating > 0 && (
                          <span className="flex items-center gap-1 bg-white/15 rounded-full px-2 py-0.5 sm:px-3 sm:py-1 text-xs sm:text-xs text-white font-semibold">
                            ⭐ {vendorOfMonth.rating.toFixed(1)}
                            {vendorOfMonth.total_reviews > 0 && <span className="text-white/60">({vendorOfMonth.total_reviews})</span>}
                          </span>
                        )}
                        {vendorOfMonth.completion_rate > 0 && (
                          <span className="flex items-center gap-1 bg-white/15 rounded-full px-2 py-0.5 sm:px-3 sm:py-1 text-xs sm:text-xs text-white font-semibold">
                            ✅ {Math.round(vendorOfMonth.completion_rate)}% completion
                          </span>
                        )}
                        {vendorOfMonth.vendor_badge && vendorOfMonth.vendor_badge !== "none" && (
                          <span className="flex items-center gap-1 bg-amber-400/90 rounded-full px-2 py-0.5 sm:px-3 sm:py-1 text-xs sm:text-xs text-amber-900 font-bold">
                            {vendorOfMonth.vendor_badge === "top" ? "🏆 Top Vendor" : vendorOfMonth.vendor_badge === "trusted" ? "✅ Trusted" : "⭐ Rising"}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        <Link href={`/vendor/${vendorOfMonth.username}`}>
                          <motion.button whileTap={{ scale: 0.97 }}
                            className="bg-white text-stone-900 font-bold px-3 py-1.5 sm:px-6 sm:py-2.5 rounded-full text-xs sm:text-sm inline-flex items-center gap-1.5 sm:gap-2 shadow-lg">
                            Shop Now <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4" />
                          </motion.button>
                        </Link>
                        <Link href="/vendor-of-month" className="text-white/70 text-xs sm:text-xs font-semibold hover:text-white transition-colors">
                          🏆 Hall of Fame
                        </Link>
                      </div>
                    </>
                  ) : (
                    <>
                      <h1 className="text-xl sm:text-3xl lg:text-5xl font-black text-white leading-[1.1] mb-1.5 sm:mb-3"
                        style={{ fontFamily: "var(--font-jakarta),'Plus Jakarta Sans',sans-serif" }}>
                        Shop Smart.<br className="sm:hidden" /> Live Campus.
                      </h1>
                      <p className="text-white/80 text-xs sm:text-sm lg:text-base mb-3 sm:mb-4 leading-relaxed line-clamp-2 sm:line-clamp-none">
                        Explore hundreds of services from verified vendors on your campus, every day.
                      </p>
                      <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                        <Link href="/categories">
                          <motion.button whileTap={{ scale: 0.97 }}
                            className="bg-white text-stone-900 font-bold px-3 py-1.5 sm:px-6 sm:py-2.5 rounded-full text-xs sm:text-sm inline-flex items-center gap-1 sm:gap-2 shadow-lg">
                            Shop Now <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4" />
                          </motion.button>
                        </Link>
                        <button onClick={() => { setActiveTab("vendors"); setTimeout(() => featuredRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }}
                          className="bg-white/20 border border-white/30 text-white font-semibold px-3 py-1.5 sm:px-6 sm:py-2.5 rounded-full text-xs sm:text-sm inline-flex items-center gap-1 sm:gap-1.5 backdrop-blur-sm hover:bg-white/30 transition">
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

              {/* Hero dot indicators */}
              <div className="flex justify-center gap-2 mt-5">
                {heroBackgrounds.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setHeroIndex(i)}
                    className={`rounded-full transition-all duration-300 ${
                      i === heroIndex ? "w-6 h-1.5 bg-white" : "w-1.5 h-1.5 bg-white/40 hover:bg-white/60"
                    }`}
                  />
                ))}
              </div>
            </div>
          </motion.div>

          {/* ── LEADERBOARD ENTRY ── */}
          <Link href="/leaderboard">
            <div className="mt-4 bg-white rounded-2xl p-4 flex items-center gap-3 border border-stone-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
              <div className="w-10 h-10 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center flex-shrink-0">
                <Trophy className="w-5 h-5 text-amber-500" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-stone-900 text-sm">🏆 Vendor Leaderboard</p>
                <p className="text-xs text-stone-400 mt-0.5">See top vendors ranked by completed orders</p>
              </div>
              <ChevronRight className="w-4 h-4 text-stone-400 flex-shrink-0" />
            </div>
          </Link>

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
          {mounted && (!isLoggedIn || (!user?.email || !["@pau.edu.ng", "@futo.edu.ng", "@imsu.edu.ng"].some(domain => user.email?.toLowerCase().includes(domain)))) && (!isLoggedIn || !(user as any)?.school) && (
            <div className="flex items-center gap-3 mt-3">
              <span className="text-xs text-stone-400 font-medium">Campus:</span>
              <select
                value={currentCampus}
                onChange={(e) => switchCampus(e.target.value as "pau" | "futo" | "imsu")}
                className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase bg-white border border-stone-200 text-stone-700 hover:border-stone-300 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 transition-all cursor-pointer"
              >
                <option value="pau">PAU</option>
                <option value="futo">FUTO</option>
                <option value="imsu">IMSU</option>
              </select>
            </div>
          )}

          {/* ── PRICE FILTER ── */}
          {activeTab === "listings" && (
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <span className="text-xs text-stone-400 font-medium">Price:</span>
              <input
                type="number" placeholder="Min ₦" value={minPrice}
                onChange={e => setMinPrice(e.target.value)}
                className="w-24 px-2.5 py-1 text-xs border border-stone-200 rounded-lg bg-white text-stone-700 focus:outline-none focus:border-teal-400 placeholder:text-stone-300"
              />
              <span className="text-stone-300 text-xs">—</span>
              <input
                type="number" placeholder="Max ₦" value={maxPrice}
                onChange={e => setMaxPrice(e.target.value)}
                className="w-24 px-2.5 py-1 text-xs border border-stone-200 rounded-lg bg-white text-stone-700 focus:outline-none focus:border-teal-400 placeholder:text-stone-300"
              />
              {(minPrice || maxPrice) && (
                <button onClick={() => { setMinPrice(""); setMaxPrice(""); }}
                  className="text-xs text-stone-400 hover:text-stone-600 transition px-2 py-1 bg-stone-100 rounded-lg">
                  Clear
                </button>
              )}
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
                {/* Grid / List toggle */}
                {activeTab === "listings" && (
                  <div className="flex bg-stone-100 rounded-lg p-0.5 gap-0.5">
                    <button onClick={() => setViewMode("grid")}
                      className={`p-1.5 rounded-md transition-all ${viewMode === "grid" ? "bg-white shadow-sm text-stone-700" : "text-stone-400 hover:text-stone-600"}`}>
                      <LayoutGrid className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setViewMode("list")}
                      className={`p-1.5 rounded-md transition-all ${viewMode === "list" ? "bg-white shadow-sm text-stone-700" : "text-stone-400 hover:text-stone-600"}`}>
                      <List className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setViewMode("scroll")}
                      className={`p-1.5 rounded-md transition-all ${viewMode === "scroll" ? "bg-white shadow-sm text-stone-700" : "text-stone-400 hover:text-stone-600"}`}>
                      <GalleryHorizontal className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                <button onClick={() => handleFilter("All")}
                  className="text-teal-600 text-sm font-semibold flex items-center gap-1 hover:text-teal-700 transition">
                  View All <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Deals skeleton — shown while deals are loading */}
            {activeTab === "listings" && !dealsReady && (
              <div className="mb-6">
                <div className="animate-pulse mb-4">
                  <div className="h-2.5 bg-stone-200 rounded w-20 mb-1.5" />
                  <div className="h-5 bg-stone-200 rounded w-28" />
                </div>
                <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4" style={{ scrollbarWidth: "none" }}>
                  {[0,1,2,3].map(i => (
                    <div key={i} className="flex-shrink-0 w-44 bg-white rounded-xl border border-stone-100 overflow-hidden animate-pulse">
                      <div className="aspect-square bg-stone-100" />
                      <div className="p-3 space-y-2">
                        <div className="h-3 bg-stone-100 rounded w-3/4" />
                        <div className="h-2.5 bg-stone-100 rounded w-1/2" />
                        <div className="h-4 bg-stone-100 rounded w-1/3 mt-1" />
                        <div className="flex gap-1.5 pt-1">
                          <div className="flex-1 h-7 bg-stone-100 rounded-xl" />
                          <div className="w-7 h-7 bg-stone-100 rounded-xl" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Deals Section — horizontal scroll strip */}
            {activeTab === "listings" && deals.length > 0 && dealsReady && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-red-600 text-xs tracking-widest uppercase font-bold">🏷️ {deals.length} deal{deals.length !== 1 ? "s" : ""}</p>
                    <h3 className="text-lg font-bold text-stone-900 mt-0.5">Hot Deals</h3>
                  </div>
                  <Link href="/deals" className="text-teal-600 text-sm font-semibold flex items-center gap-1 hover:text-teal-700 transition">
                    See all <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
                <div
                  className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4"
                  style={{ scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
                >
                  {deals.map((deal, i) => (
                    <div key={deal.listing?.id ?? i} className="flex-shrink-0 w-44">
                      {renderDealCard(deal, i)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Listings */}
            {activeTab === "listings" && (
              <>
                {mounted && !campusReady ? (
                  <div className="space-y-10">
                    {[0, 1].map(section => (
                      <div key={section}>
                        <div className="animate-pulse mb-4">
                          <div className="h-2.5 bg-stone-200 rounded w-16 mb-1.5" />
                          <div className="h-5 bg-stone-200 rounded w-32" />
                        </div>
                        {viewMode === "scroll" ? (
                          <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4" style={{ scrollbarWidth: "none" }}>
                            {[0,1,2,3,4].map(i => (
                              <div key={i} className="flex-shrink-0 w-44 bg-white rounded-xl border border-stone-100 overflow-hidden animate-pulse">
                                <div className="aspect-square bg-stone-100" />
                                <div className="p-3 space-y-2">
                                  <div className="h-3 bg-stone-100 rounded w-3/4" />
                                  <div className="h-2.5 bg-stone-100 rounded w-1/2" />
                                  <div className="h-2.5 bg-stone-100 rounded w-2/3" />
                                  <div className="h-2.5 bg-stone-100 rounded w-1/3" />
                                  <div className="h-4 bg-stone-100 rounded w-1/3 mt-1" />
                                  <div className="flex gap-1.5 pt-1">
                                    <div className="flex-1 h-8 bg-stone-100 rounded-xl" />
                                    <div className="w-8 h-8 bg-stone-100 rounded-xl" />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : viewMode === "list" ? (
                          <div className="space-y-2">
                            {[0,1,2,3].map(i => (
                              <div key={i} className="bg-white rounded-xl border border-stone-100 overflow-hidden animate-pulse flex gap-3 p-3">
                                <div className="w-16 h-16 bg-stone-100 rounded-lg flex-shrink-0" />
                                <div className="flex-1 space-y-2 py-1">
                                  <div className="h-3 bg-stone-100 rounded w-3/4" />
                                  <div className="h-2.5 bg-stone-100 rounded w-1/2" />
                                  <div className="h-4 bg-stone-100 rounded w-1/3" />
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                            {[0,1,2,3].map(i => (
                              <div key={i} className="bg-white rounded-xl border border-stone-100 overflow-hidden animate-pulse">
                                <div className="aspect-square bg-stone-100" />
                                <div className="p-3 space-y-2">
                                  <div className="h-3 bg-stone-100 rounded w-3/4" />
                                  <div className="h-2.5 bg-stone-100 rounded w-1/2" />
                                  <div className="h-2.5 bg-stone-100 rounded w-2/3" />
                                  <div className="h-2.5 bg-stone-100 rounded w-1/3" />
                                  <div className="h-4 bg-stone-100 rounded w-1/3 mt-1" />
                                  <div className="flex gap-1.5 pt-1">
                                    <div className="flex-1 h-8 bg-stone-100 rounded-xl" />
                                    <div className="w-8 h-8 bg-stone-100 rounded-xl" />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : activeFilter === "All" ? (
                  nonDealListings.length === 0 && deals.length === 0 ? (
                    <div className="bg-white rounded-2xl p-16 text-center border border-stone-100 shadow-sm">
                      <Sparkles className="w-12 h-12 text-stone-200 mx-auto mb-3" />
                      <h3 className="text-lg font-bold text-stone-400">No listings yet</h3>
                      <p className="text-stone-400 text-sm mt-1">Check back soon!</p>
                    </div>
                  ) : nonDealListings.length === 0 ? null : (
                    <div className="space-y-10">
                      {/* New Arrivals — listings posted within 48 hours */}
                      {newArrivals.length > 0 && (
                        <div>
                          <div className="flex items-center justify-between mb-4">
                            <div>
                              <p className="text-teal-600 text-xs tracking-widest uppercase font-bold">{newArrivals.length} new</p>
                              <h3 className="text-lg font-bold text-stone-900 mt-0.5">New Arrivals</h3>
                            </div>
                          </div>
                          <div className={gridClass} style={gridStyle}>
                            {newArrivals.map((l, i) => renderItem(l, i))}
                          </div>
                        </div>
                      )}
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
                          <div className={gridClass} style={gridStyle}>
                            {section.items.map((l, i) => renderItem(l, i))}
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
                      <div className={gridClass} style={gridStyle}>
                        {filteredListings.map((l, i) => renderItem(l, i))}
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
          <div className="animate-fadeUp mt-10 rounded-2xl overflow-hidden" style={{ background: HERO_GRAD }}>
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
          </div>

        </div>
      </div>
    </>
  );
}
