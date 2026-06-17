"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Search,
  Sparkles, ShoppingCart, MapPin, Star, Clock,
} from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/authStore";
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


interface Props {
  slug: string;
  initialListings: any[];
  initialNextPage: string | null;
}

export default function CategoryPageClient({ slug, initialListings, initialNextPage }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const { addToCart, cart } = useCart();

  const [listings, setListings] = useState<any[]>(initialListings);
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(initialListings.length === 0);
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");

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

  const filteredListings = listings.filter(l =>
    !search.trim() ||
    l.title?.toLowerCase().includes(search.toLowerCase()) ||
    l.vendor?.username?.toLowerCase().includes(search.toLowerCase())
  );

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
          <div className="flex items-center gap-3 px-4 py-3 max-w-2xl mx-auto">
            <button onClick={() => router.back()} className="w-9 h-9 rounded-xl bg-stone-100 flex items-center justify-center flex-shrink-0">
              <ArrowLeft className="w-4 h-4 text-stone-700" />
            </button>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
              <input
                type="text"
                placeholder={`Search ${title.toLowerCase()}…`}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 placeholder:text-stone-400"
              />
            </div>
          </div>
          <div className="px-4 pb-2.5 max-w-2xl mx-auto">
            <p className="text-teal-600 text-xs font-semibold tracking-widest uppercase">{title}</p>
            {!loading && <p className="text-stone-400 text-xs mt-0.5">{filteredListings.length} listing{filteredListings.length !== 1 ? "s" : ""}</p>}
          </div>
        </div>

        <div className="px-4 pt-5 pb-28 max-w-2xl mx-auto">
          {loading ? (
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
          ) : filteredListings.length === 0 ? (
            <div className="bg-white rounded-2xl p-16 text-center border border-stone-100 shadow-sm mt-4">
              <Sparkles className="w-12 h-12 text-stone-200 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-stone-400">
                {search ? "No results" : "No listings yet"}
              </h3>
              <p className="text-stone-400 text-sm mt-1">
                {search ? `Nothing matches "${search}"` : `Nothing in ${title} on your campus right now.`}
              </p>
              {!search && (
                <Link href="/home">
                  <button className="mt-5 px-5 py-2.5 text-white text-sm font-bold rounded-xl" style={{ background: GRAD }}>
                    Browse All
                  </button>
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredListings.map((l, i) => renderListingRow(l, i))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
