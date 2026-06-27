"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Sparkles, Heart, ShoppingCart, Share2, MapPin, Star } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/authStore";
import { useWishlistStore } from "@/lib/wishlistStore";
import { useCart } from "@/lib/cartStore";
import { TEAL } from "@/lib/tokens";

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

export default function DealsPage() {
  const router = useRouter();
  const { user, isLoggedIn } = useAuth();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlistStore();
  const { addToCart, cart } = useCart();

  const [deals, setDeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [mounted, setMounted] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2000); };

  useEffect(() => {
    setMounted(true);
    const campus = document.cookie.split(";").find(s => s.trim().startsWith("studex_campus="))?.split("=")?.[1] || "pau";
    api.pub.deals(campus)
      .then(r => r.ok ? r.json() : [])
      .then(d => setDeals(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      {toast && (
        <motion.div initial={{ y: -50, opacity: 0 }} animate={{ y: 60, opacity: 1 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full shadow-lg z-50 font-medium text-sm text-white"
          style={{ background: TEAL }}>
          {toast}
        </motion.div>
      )}

      <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>

        {/* Top bar */}
        <div className="sticky top-0 bg-white z-40 border-b border-stone-200 shadow-sm">
          <div className="flex items-center gap-3 px-4 py-3 max-w-2xl mx-auto">
            <button onClick={() => router.back()} className="w-9 h-9 rounded-xl bg-stone-100 flex items-center justify-center flex-shrink-0">
              <ArrowLeft className="w-4 h-4 text-stone-700" />
            </button>
            <div>
              <h1 className="font-bold text-stone-900 text-base">Hot Deals</h1>
              {!loading && <p className="text-xs text-stone-400">{deals.length} deal{deals.length !== 1 ? "s" : ""} available</p>}
            </div>
          </div>
        </div>

        <div className="px-4 pt-5 pb-28 max-w-2xl mx-auto">

          {loading ? (
            <div className="grid grid-cols-2 gap-4">
              {[0,1,2,3].map(i => (
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
          ) : deals.length === 0 ? (
            <div className="bg-white rounded-2xl p-16 text-center border border-stone-100 shadow-sm mt-4">
              <Sparkles className="w-12 h-12 text-stone-200 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-stone-400">No deals right now</h3>
              <p className="text-stone-400 text-sm mt-1">Check back soon for discounts!</p>
              <Link href="/home">
                <button className="mt-5 px-5 py-2.5 text-white text-sm font-bold rounded-xl" style={{ background: TEAL }}>
                  Browse Listings
                </button>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {deals.map((deal, i) => {
                const listing    = deal.listing;
                const wishlisted = mounted && isInWishlist(listing.id);
                const inCart     = cart.some(ci => ci.id === listing.id);
                const isService  = (listing.listing_type || "").toLowerCase() === "service";
                const isOwn      = !!(user?.id && user.id === listing.vendor?.id);
                const dealPrice  = Number(deal.discounted_price);
                const rating     = listing.vendor?.profile?.rating;
                const reviews    = listing.vendor?.profile?.total_reviews;

                return (
                  <div key={listing.id} className="bg-white rounded-xl border border-stone-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow relative">

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
                        <motion.button onClick={e => {
                          e.preventDefault(); e.stopPropagation();
                          if (wishlisted) { removeFromWishlist(listing.id); showToast("Removed from Wishlist"); }
                          else { addToWishlist({ id: listing.id, title: listing.title, price: dealPrice, img: listing.image }); showToast("Added to Wishlist ❤️"); }
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
                        {(reviews ?? 0) > 0 && (
                          <div className="flex items-center gap-0.5 mt-1">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                            <span className="text-xs text-stone-600 font-medium">{rating}</span>
                            <span className="text-xs text-stone-400">({reviews})</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 mt-2">
                          <p className="font-bold text-stone-400 text-xs line-through">₦{Number(listing.price).toLocaleString()}</p>
                          <p className="font-bold text-red-600 text-sm">₦{dealPrice.toLocaleString()}</p>
                        </div>

                        <div className="flex gap-1.5 mt-2">
                          {!isOwn && listing.is_available && (
                            <button
                              onClick={e => {
                                if (isService) return;
                                e.preventDefault(); e.stopPropagation();
                                addToCart({ id: listing.id, title: listing.title, price: dealPrice, img: listing.image || "" });
                                showToast(inCart ? "Added again (+1)" : "Added to cart");
                              }}
                              className="flex-1 py-2 rounded-xl text-white text-xs font-bold flex items-center justify-center gap-1 hover:opacity-90 transition-opacity"
                              style={{ background: "linear-gradient(135deg,#2DD4BF 0%,#0D9488 100%)" }}>
                              <ShoppingCart className="w-3.5 h-3.5" />
                              {isService ? "Book Now" : inCart ? "In Cart" : "Add to Cart"}
                            </button>
                          )}
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
                      </div>
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
