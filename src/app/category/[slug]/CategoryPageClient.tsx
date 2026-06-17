"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, LayoutGrid, List, GalleryHorizontal,
  Sparkles, Heart, ShoppingCart, Share2, MapPin, Star, Clock,
} from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/authStore";
import { useWishlistStore } from "@/lib/wishlistStore";
import { useCart } from "@/lib/cartStore";
import { GRAD } from "@/lib/tokens";

function slugToTitle(slug: string) {
  return slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function SafeImage({ src, alt }: { src: string | null | undefined; alt: string }) {
  const [error, setError] = useState(false);
  if (!src || error || !src.startsWith("http")) {
    return (
      <div className="w-full h-full bg-gradient-to-br from-teal-50 to-purple-50 flex items-center justify-center">
        <Sparkles className="w-6 h-6 text-stone-300" />
      </div>
    );
  }
  return <img src={src} alt={alt} loading="lazy" className="w-full h-full object-cover" onError={() => setError(true)} />;
}

const BADGE_LABELS: Record<string, string> = {
  rising: "⚡ Rising",
  trusted: "✅ Trusted",
  top: "🏆 Top Vendor",
};

interface Props {
  slug: string;
  initialListings: any[];
  initialNextPage: string | null;
}

export default function CategoryPageClient({ slug, initialListings, initialNextPage }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlistStore();
  const { addToCart, cart } = useCart();

  const [listings, setListings] = useState<any[]>(initialListings);
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(initialListings.length === 0);
  const [toast, setToast] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list" | "scroll">("grid");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");

  const title = slugToTitle(slug);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2000); };

  useEffect(() => {
    setMounted(true);
    const campus = document.cookie.split(";").find(s => s.trim().startsWith("studex_campus="))?.split("=")?.[1] || "pau";
    api.pub.listings({ campus, category: slug, page_size: "100" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setListings(d.results || d || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  const applyPriceFilter = (items: any[]) => {
    const min = parseFloat(minPrice);
    const max = parseFloat(maxPrice);
    return items.filter(l => {
      const p = Number(l.price);
      if (!isNaN(min) && p < min) return false;
      if (!isNaN(max) && p > max) return false;
      return true;
    });
  };

  const filteredListings = applyPriceFilter(listings);

  const renderListingCard = (listing: any, i: number) => {
    const badge         = listing.vendor?.profile?.vendor_badge;
    const rating        = listing.vendor?.profile?.rating;
    const totalReviews  = listing.vendor?.profile?.total_reviews;
    const wishlisted    = mounted && isInWishlist(listing.id);
    const isService     = (listing.listing_type || "").toLowerCase() === "service";
    const isOwn         = !!(user?.id && user.id === listing.vendor?.id);
    const isReserved    = !isService && !isOwn && !!listing.is_reserved;
    const inCart        = cart.some(ci => ci.id === listing.id);
    const discountPct   = listing.discount_percent || 0;
    const effectivePrice = discountPct > 0
      ? Math.round(Number(listing.price) * (1 - discountPct / 100))
      : Number(listing.price);

    return (
      <div key={listing.id}
        className="animate-fadeUp bg-white rounded-xl border border-stone-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow"
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
            {(totalReviews ?? 0) > 0 && (
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
                      if (isOwn) { e.preventDefault(); e.stopPropagation(); router.push('/vendor/dashboard/listings'); return; }
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
                      if (navigator.share) { await navigator.share({ title: listing.title, url }).catch(() => {}); }
                      else { await navigator.clipboard.writeText(url); showToast("Link copied!"); }
                    }}
                    className="p-2 rounded-xl bg-stone-100 hover:bg-stone-200 transition flex items-center justify-center flex-shrink-0">
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

  const renderListingRow = (listing: any, i: number) => {
    const rating        = listing.vendor?.profile?.rating;
    const totalReviews  = listing.vendor?.profile?.total_reviews;
    const isService     = (listing.listing_type || "").toLowerCase() === "service";
    const isOwn         = !!(user?.id && user.id === listing.vendor?.id);
    const isReserved    = !isService && !isOwn && !!listing.is_reserved;
    const inCart        = cart.some(ci => ci.id === listing.id);
    return (
      <div key={listing.id}
        className="animate-fadeUp bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow flex items-center gap-4 p-4"
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
              if (!isService) { addToCart({ id: listing.id, title: listing.title, price: listing.price, img: listing.image || "" }); showToast(inCart ? "Added again (+1)" : "Added to cart"); }
              else { router.push(`/listing/${listing.id}`); }
            }}
            className="flex-shrink-0 px-4 py-3 text-white text-sm font-bold rounded-xl"
            style={{ background: "linear-gradient(135deg,#2DD4BF 0%,#0D9488 100%)" }}>
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

  const btnCls = (mode: string) =>
    `p-1.5 rounded-md transition-all ${viewMode === mode ? "bg-white shadow-sm text-stone-700" : "text-stone-400 hover:text-stone-600"}`;

  return (
    <>
      {toast && (
        <motion.div initial={{ y: -50, opacity: 0 }} animate={{ y: 60, opacity: 1 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full shadow-lg z-50 font-medium text-sm text-white"
          style={{ background: GRAD }}>
          {toast}
        </motion.div>
      )}

      <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>

        {/* Sticky top bar */}
        <div className="sticky top-0 bg-white z-40 border-b border-stone-200 shadow-sm">
          <div className="flex items-center justify-between px-4 py-3 max-w-2xl mx-auto gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button onClick={() => router.back()} className="w-9 h-9 rounded-xl bg-stone-100 flex items-center justify-center flex-shrink-0">
                <ArrowLeft className="w-4 h-4 text-stone-700" />
              </button>
              <div className="min-w-0">
                <h1 className="font-bold text-stone-900 text-base truncate">{title}</h1>
                {!loading && (
                  <p className="text-xs text-stone-400">
                    {filteredListings.length} listing{filteredListings.length !== 1 ? "s" : ""}
                  </p>
                )}
              </div>
            </div>
            <div className="flex bg-stone-100 rounded-lg p-0.5 gap-0.5 flex-shrink-0">
              <button onClick={() => setViewMode("grid")} className={btnCls("grid")} title="Grid"><LayoutGrid className="w-3.5 h-3.5" /></button>
              <button onClick={() => setViewMode("list")} className={btnCls("list")} title="List"><List className="w-3.5 h-3.5" /></button>
              <button onClick={() => setViewMode("scroll")} className={btnCls("scroll")} title="Scroll"><GalleryHorizontal className="w-3.5 h-3.5" /></button>
            </div>
          </div>

          {/* Price filter */}
          <div className="flex gap-2 px-4 pb-3 max-w-2xl mx-auto">
            <input type="number" placeholder="Min ₦" value={minPrice} onChange={e => setMinPrice(e.target.value)}
              className="flex-1 bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-700 focus:outline-none focus:ring-1 focus:ring-teal-400 placeholder:text-stone-400" />
            <input type="number" placeholder="Max ₦" value={maxPrice} onChange={e => setMaxPrice(e.target.value)}
              className="flex-1 bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-700 focus:outline-none focus:ring-1 focus:ring-teal-400 placeholder:text-stone-400" />
          </div>
        </div>

        <div className="px-4 pt-5 pb-28 max-w-2xl mx-auto">
          {loading ? (
            viewMode === "scroll" ? (
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4" style={{ scrollbarWidth: "none" }}>
                {[0,1,2,3,4].map(i => (
                  <div key={i} className="flex-shrink-0 w-44 bg-white rounded-xl border border-stone-100 overflow-hidden animate-pulse">
                    <div className="aspect-square bg-stone-100" />
                    <div className="p-3 space-y-2">
                      <div className="h-3 bg-stone-100 rounded w-3/4" />
                      <div className="h-2.5 bg-stone-100 rounded w-1/2" />
                      <div className="h-2.5 bg-stone-100 rounded w-2/3" />
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
                {[0,1,2,3,4].map(i => (
                  <div key={i} className="bg-white rounded-2xl border border-stone-100 overflow-hidden animate-pulse flex gap-3 p-4">
                    <div className="w-24 h-24 bg-stone-100 rounded-xl flex-shrink-0" />
                    <div className="flex-1 space-y-2 py-1">
                      <div className="h-3.5 bg-stone-100 rounded w-3/4" />
                      <div className="h-3 bg-stone-100 rounded w-1/2" />
                      <div className="h-3 bg-stone-100 rounded w-1/3" />
                      <div className="h-4 bg-stone-100 rounded w-1/4 mt-2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {[0,1,2,3,5].map(i => (
                  <div key={i} className="bg-white rounded-xl border border-stone-100 overflow-hidden animate-pulse">
                    <div className="aspect-square bg-stone-100" />
                    <div className="p-3 space-y-2">
                      <div className="h-3 bg-stone-100 rounded w-3/4" />
                      <div className="h-2.5 bg-stone-100 rounded w-1/2" />
                      <div className="h-2.5 bg-stone-100 rounded w-2/3" />
                      <div className="h-4 bg-stone-100 rounded w-1/3 mt-1" />
                      <div className="flex gap-1.5 pt-1">
                        <div className="flex-1 h-8 bg-stone-100 rounded-xl" />
                        <div className="w-8 h-8 bg-stone-100 rounded-xl" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : filteredListings.length === 0 ? (
            <div className="bg-white rounded-2xl p-16 text-center border border-stone-100 shadow-sm mt-4">
              <Sparkles className="w-12 h-12 text-stone-200 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-stone-400">No listings yet</h3>
              <p className="text-stone-400 text-sm mt-1">Nothing in {title} on your campus right now.</p>
              <Link href="/home">
                <button className="mt-5 px-5 py-2.5 text-white text-sm font-bold rounded-xl" style={{ background: GRAD }}>
                  Browse All
                </button>
              </Link>
            </div>
          ) : (
            <div className={gridClass} style={gridStyle}>
              {filteredListings.map((l, i) => renderItem(l, i))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
