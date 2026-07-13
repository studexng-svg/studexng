"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Star, MessageCircle, ShoppingCart, Calendar,
  Clock, CheckCircle, AlertCircle,
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Sparkles, ZoomIn, X as XIcon,
  Shield, Share2, Tag, Truck, Package, Heart, Minus, Plus,
  BadgeCheck, Zap, Lock,
} from "lucide-react";
import TopNav from "@/components/layout/TopNav";
import { useAuth } from "@/lib/authStore";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { GRAD, TEAL, PURPLE } from "@/lib/tokens";
import VendorBadge from "@/components/VendorBadge";
import ChatWindow from "@/components/ChatWindow";
import BookingWizard from "@/components/booking/BookingWizard";
import { useAdminMode } from "@/hooks/useAdminMode";

interface Review {
  id: number;
  reviewer_username: string;
  rating: number;
  comment: string;
  created_at: string;
  listing_title: string;
}

interface Listing {
  id: number;
  title: string;
  description: string;
  price: number;
  discount_percent?: number;
  sale_price?: number | null;
  deal?: { discount_percent: number; discounted_price: number } | null;
  image: string;
  is_available: boolean;
  is_reserved: boolean;
  listing_type: string;
  track_inventory?: boolean;
  stock_quantity?: number;
  category: { id: number; title: string; slug: string };
  campus?: string;
  vendor: {
    id: number;
    username: string;
    business_name?: string;
    profile_picture?: string | null;
    vendor_badge?: "none" | "rising" | "trusted" | "top" | null;
    completion_rate?: number;
    rating?: number;
    total_reviews?: number;
  };
}

/* ── Related card ──────────────────────────────────────────────────────── */
function RelatedCard({ item }: { item: any }) {
  const router = useRouter();
  const isService = (item.listing_type || "").toLowerCase() === "service";
  const src = item.image?.startsWith("http") ? item.image : null;
  const price = Number(item.deal?.discounted_price ?? item.price);
  const orig  = item.deal ? Number(item.price) : null;

  return (
    <div
      className="w-44 flex-shrink-0 bg-white rounded-2xl overflow-hidden shadow-sm border border-stone-100 cursor-pointer hover:shadow-md hover:border-stone-200 transition-all group"
      onClick={() => router.push(`/listing/${item.id}`)}>
      <div className="aspect-[3/4] bg-stone-50 overflow-hidden">
        {src
          ? <img src={src} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-400" loading="lazy" />
          : <div className="w-full h-full flex items-center justify-center"><Sparkles className="w-6 h-6 text-stone-300" /></div>
        }
      </div>
      <div className="p-3">
        <p className="text-xs font-semibold text-stone-800 line-clamp-2 leading-snug mb-1.5">{item.title}</p>
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-black text-stone-900">₦{price.toLocaleString()}</p>
          {orig && <p className="text-xs text-stone-400 line-through">₦{orig.toLocaleString()}</p>}
        </div>
      </div>
    </div>
  );
}

function RelatedSkeleton() {
  return (
    <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
      {[0,1,2,3].map(i => (
        <div key={i} className="w-44 flex-shrink-0 bg-white rounded-2xl overflow-hidden animate-pulse">
          <div className="aspect-[3/4] bg-stone-100" />
          <div className="p-3 space-y-2"><div className="h-3 bg-stone-100 rounded" /><div className="h-3 bg-stone-100 rounded w-2/3" /></div>
        </div>
      ))}
    </div>
  );
}

function getStockWarning(data: Listing | null): string {
  if (!data) return "";
  if (data.track_inventory && (data.stock_quantity ?? 0) <= 3 && (data.stock_quantity ?? 0) > 0)
    return `Only ${data.stock_quantity} left in stock!`;
  if (data.track_inventory && data.stock_quantity === 0) return "Out of stock";
  return "";
}

interface Props { id: string; initialListing: Listing | null; initialReviews: Review[]; }

export default function ListingDetailClient({ id, initialListing, initialReviews }: Props) {
  const router = useRouter();
  const { isLoggedIn } = useAuth();
  const queryClient = useQueryClient();
  const { isAdmin } = useAdminMode();

  const [adminLoading,  setAdminLoading]  = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [listing,       setListing]       = useState<Listing | null>(initialListing);
  const [reviews]                         = useState<Review[]>(initialReviews);
  const [stockWarning,  setStockWarning]  = useState(() => getStockWarning(initialListing));
  const [showChat,      setShowChat]      = useState(false);
  const [showBookingWizard, setShowBookingWizard] = useState(false);
  // Chat is payment-gated (see chat/views.py ConversationViewSet). A buyer can only
  // message the vendor once a paid order already exists for this listing — check for
  // an existing unlocked conversation rather than assuming every visit is pre-payment.
  const [unlockedConversationId, setUnlockedConversationId] = useState<number | null>(null);
  const [toast,         setToast]         = useState("");
  const [imageOpen,     setImageOpen]     = useState(false);
  const [activeIdx,     setActiveIdx]     = useState(0);
  const [qty,           setQty]           = useState(1);
  const [descExpanded,  setDescExpanded]  = useState(false);

  const touchStartX = useRef<number | null>(null);
  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd   = (e: React.TouchEvent) => {
    if (touchStartX.current === null || allImages.length <= 1) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < 40) return;
    if (delta < 0) setActiveIdx(i => Math.min(i + 1, allImages.length - 1));
    else           setActiveIdx(i => Math.max(i - 1, 0));
  };

  const [vendorListings, setVendorListings]         = useState<any[]>([]);
  const [vendorLoading,  setVendorLoading]           = useState(false);
  const [similarItems,   setSimilarItems]            = useState<any[]>([]);
  const [similarLoading, setSimilarLoading]          = useState(false);
  const [alsoLike,       setAlsoLike]               = useState<any[]>([]);
  const [alsoLikeLoading, setAlsoLikeLoading]       = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  useEffect(() => {
    if (!listing?.vendor?.username) return;
    setVendorLoading(true);
    api.pub.listings({ vendor_username: listing.vendor.username, page_size: "12" })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setVendorListings((d.results||d||[]).filter((l:any) => l.id !== listing.id && l.is_available !== false).slice(0,8)))
      .catch(()=>{}).finally(()=>setVendorLoading(false));
  }, [listing?.vendor?.username, listing?.id]);

  useEffect(() => {
    const slug = listing?.category?.slug, campus = listing?.campus;
    if (!slug || !campus) return;
    setSimilarLoading(true);
    api.pub.listings({ campus, category: slug, page_size: "8" })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setSimilarItems((d.results||d||[]).filter((l:any) => l.id !== listing.id && l.vendor?.username !== listing.vendor?.username).slice(0,6)))
      .catch(()=>{}).finally(()=>setSimilarLoading(false));
  }, [listing?.category?.slug, listing?.campus, listing?.id, listing?.vendor?.username]);

  useEffect(() => {
    const campus = listing?.campus;
    if (!campus) return;
    setAlsoLikeLoading(true);
    api.pub.listings({ campus, page_size: "12" })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setAlsoLike([...(d.results||d||[]).filter((l:any)=>l.id!==listing.id)].sort(()=>Math.random()-0.5).slice(0,8)))
      .catch(()=>{}).finally(()=>setAlsoLikeLoading(false));
  }, [listing?.campus, listing?.id]);

  useEffect(() => {
    if (!isLoggedIn || !listing?.id) { setUnlockedConversationId(null); return; }
    api.chat.conversations()
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => {
        const list = d.results || d || [];
        const match = list.find((c: any) => c.listing === listing.id && c.is_unlocked);
        setUnlockedConversationId(match ? match.id : null);
      })
      .catch(() => setUnlockedConversationId(null));
  }, [isLoggedIn, listing?.id]);

  const handleAddToCart = async () => {
    if (!listing) return;
    if (!isLoggedIn) { router.push("/auth"); return; }
    try {
      const res = await api.cart.add({ listing_id: listing.id, quantity: qty });
      if (!res.ok) {
        const data = await res.json();
        const msg: string = data.error || data.detail || "Could not add to cart";
        if (msg.toLowerCase().includes("reserved")) {
          setListing(prev => prev ? { ...prev, is_reserved: true } : prev);
          showToast("This item is currently reserved by another user");
        } else showToast(msg);
        return;
      }
      const isSingleStock = listing.track_inventory && listing.stock_quantity === 1;
      showToast(isSingleStock ? "Item reserved for 10 minutes!" : `Added to cart!`);
      try { sessionStorage.setItem("cart-referrer", window.location.pathname); } catch {}
      queryClient.invalidateQueries({ queryKey: ["cart"] });
    } catch { showToast("Could not add to cart. Please try again."); }
  };

  const openBookingWizard = () => {
    if (!isLoggedIn) { router.push("/auth"); return; }
    setShowBookingWizard(true);
  };

  const handleBookingSuccess = (orderId: number) => {
    setShowBookingWizard(false);
    router.push(`/order-confirmation/${orderId}`);
  };

  const handleAdminToggle = async () => {
    if (!listing) return;
    setAdminLoading("toggle");
    try {
      const res = await api.admin.updateListing(listing.id, { is_available: !listing.is_available });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setListing(prev => prev ? { ...prev, is_available: updated.is_available } : prev);
      showToast(updated.is_available ? "Listing approved and live!" : "Listing hidden from marketplace");
    } catch { showToast("Failed to update listing"); }
    finally { setAdminLoading(null); }
  };

  const handleAdminDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setAdminLoading("delete");
    try {
      const res = await api.admin.deleteListing(listing!.id);
      if (!res.ok && res.status !== 204) throw new Error();
      showToast("Listing deleted"); setTimeout(() => router.back(), 1200);
    } catch { showToast("Failed to delete listing"); setAdminLoading(null); setConfirmDelete(false); }
  };

  const handleShare = async () => {
    const url = window.location.href;
    const effectivePrice = listing?.deal?.discounted_price ?? listing?.sale_price ?? listing?.price;
    if (navigator.share) await navigator.share({ title: `${listing?.title} — ₦${Number(effectivePrice).toLocaleString()}`, url }).catch(()=>{});
    else { await navigator.clipboard.writeText(url); showToast("Link copied!"); }
  };

  const isService = (listing?.listing_type || "").toLowerCase() === "service";

  /* ── not found ── */
  if (!listing) return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6" style={{ fontFamily:"'DM Sans',sans-serif" }}>
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center bg-red-50"><AlertCircle className="w-8 h-8 text-red-400" /></div>
        <h3 className="text-lg font-bold text-stone-900 mb-1" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Listing not found</h3>
        <p className="text-stone-400 text-sm mb-4">This listing may have been removed.</p>
        <button onClick={() => router.back()} className="px-6 py-2.5 text-white font-medium rounded-full text-sm" style={{ background: TEAL }}>Go Back</button>
      </div>
    </div>
  );

  const vendorName    = listing.vendor.business_name || listing.vendor.username;
  const badge         = listing.vendor.vendor_badge;
  const rating        = Number(listing.vendor.rating) || 0;
  const totalReviews  = Number(listing.vendor.total_reviews) || 0;
  const completionRate= Number(listing.vendor.completion_rate) || 0;
  const effectivePrice= listing.deal?.discounted_price ?? listing.sale_price ?? null;
  const discountPct   = listing.deal?.discount_percent ?? listing.discount_percent ?? 0;
  const displayPrice  = effectivePrice !== null && effectivePrice < listing.price ? Number(effectivePrice) : Number(listing.price);
  const hasDiscount   = effectivePrice !== null && Number(effectivePrice) < listing.price;
  const variants      = (listing as any).variants as { id: number; price: number | string }[] | undefined;
  const hasVariants   = !!variants?.length;
  const minVariantPrice = hasVariants ? Math.min(...variants!.map(v => Number(v.price))) : null;

  const allImages = [listing.image,(listing as any).image2,(listing as any).image3,(listing as any).image4,(listing as any).image5]
    .filter((img): img is string => !!img && img.startsWith("http"));
  const activeImg = allImages[activeIdx] ?? null;

  /* rating breakdown */
  const ratingCounts = [5,4,3,2,1].map(n => ({ n, count: reviews.filter(r => r.rating === n).length }));

  /* ─────────────── RENDER ─────────────── */
  return (
    <>
      <AnimatePresence>
        {toast && (
          <motion.div key="toast" initial={{ y:-40, opacity:0 }} animate={{ y:72, opacity:1 }} exit={{ opacity:0 }}
            className="fixed top-0 left-1/2 -translate-x-1/2 z-[9999] px-6 py-3 rounded-full text-white text-sm font-semibold shadow-xl" style={{ background: TEAL }}>
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {showChat && (
        <ChatWindow sellerId={listing.vendor.id} sellerName={vendorName} listingId={listing.id}
          productName={listing.title} originalPrice={listing.price} onClose={() => setShowChat(false)} />
      )}

      {/* Lightbox */}
      <AnimatePresence>
        {imageOpen && (
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4" onClick={() => setImageOpen(false)}>
            <button onClick={() => setImageOpen(false)} className="absolute top-4 right-4 w-10 h-10 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center z-10">
              <XIcon className="w-5 h-5 text-white" />
            </button>
            <motion.img initial={{ scale:0.9 }} animate={{ scale:1 }} exit={{ scale:0.9 }} transition={{ duration:0.2 }}
              src={activeImg ?? ""} alt={listing.title}
              className="max-w-full max-h-full object-contain rounded-xl shadow-2xl" onClick={e => e.stopPropagation()} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="min-h-screen bg-white" style={{ fontFamily:"'DM Sans',sans-serif" }}>
        <TopNav showBack />

        <div className="max-w-6xl mx-auto px-4 lg:px-8 pt-4 lg:pt-8 pb-28">

          {/* ══════════ MAIN PRODUCT SECTION ══════════ */}
          <div className="lg:grid lg:grid-cols-2 lg:gap-16">

            {/* ─── LEFT: image gallery ─── */}
            <div>
              {/* Desktop: thumbnails strip + main image side-by-side */}
              <div className="flex gap-3">
                {/* Vertical thumbnail strip — desktop only */}
                {allImages.length > 1 && (
                  <div className="hidden lg:flex flex-col gap-2 flex-shrink-0 w-16">
                    {allImages.map((img, idx) => (
                      <button key={idx} onClick={() => setActiveIdx(idx)}
                        className={`aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                          activeIdx === idx ? "border-teal-500 shadow-md shadow-teal-200" : "border-stone-200 opacity-60 hover:opacity-100"
                        }`}>
                        <img src={img} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}

                {/* Main image */}
                <div className="flex-1 relative">
                  <div
                    className={`w-full bg-stone-50 rounded-2xl overflow-hidden ${activeImg ? "cursor-zoom-in" : ""} aspect-square lg:aspect-[4/5]`}
                    onClick={() => activeImg && setImageOpen(true)}
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                  >
                    {activeImg
                      ? <img src={activeImg} alt={listing.title} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center"><Sparkles className="w-16 h-16 text-stone-200" /></div>
                    }
                    {!listing.is_available && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-2xl">
                        <span className="bg-red-500 text-white font-bold px-6 py-2 rounded-full text-sm">Unavailable</span>
                      </div>
                    )}
                    {hasDiscount && (
                      <div className="absolute top-3 left-3 bg-red-500 text-white text-xs font-black px-2.5 py-1 rounded-xl shadow">
                        -{discountPct}% OFF
                      </div>
                    )}
                    {activeImg && (
                      <div className="absolute bottom-3 right-3 bg-black/40 backdrop-blur-sm rounded-full p-2">
                        <ZoomIn className="w-4 h-4 text-white" />
                      </div>
                    )}
                  </div>

                  {/* Mobile swipe arrows */}
                  {allImages.length > 1 && (
                    <>
                      {activeIdx > 0 && (
                        <button
                          onClick={e => { e.stopPropagation(); setActiveIdx(i => i - 1); }}
                          className="lg:hidden absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/30 backdrop-blur-sm rounded-full flex items-center justify-center z-10">
                          <ChevronLeft className="w-4 h-4 text-white" />
                        </button>
                      )}
                      {activeIdx < allImages.length - 1 && (
                        <button
                          onClick={e => { e.stopPropagation(); setActiveIdx(i => i + 1); }}
                          className="lg:hidden absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/30 backdrop-blur-sm rounded-full flex items-center justify-center z-10">
                          <ChevronRight className="w-4 h-4 text-white" />
                        </button>
                      )}
                    </>
                  )}

                  {/* Mobile thumbnail dots */}
                  {allImages.length > 1 && (
                    <div className="flex justify-center gap-1.5 mt-3 lg:hidden">
                      {allImages.map((_, idx) => (
                        <button key={idx} onClick={() => setActiveIdx(idx)}
                          className={`rounded-full transition-all ${activeIdx === idx ? "w-5 h-1.5 bg-teal-500" : "w-1.5 h-1.5 bg-stone-300"}`} />
                      ))}
                    </div>
                  )}

                  {/* Mobile horizontal thumbnails */}
                  {allImages.length > 1 && (
                    <div className="flex gap-2 mt-3 overflow-x-auto lg:hidden" style={{ scrollbarWidth:"none" }}>
                      {allImages.map((img, idx) => (
                        <button key={idx} onClick={() => setActiveIdx(idx)}
                          className={`flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden border-2 transition ${activeIdx===idx?"border-teal-500":"border-transparent opacity-60 hover:opacity-100"}`}>
                          <img src={img} alt="" className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ─── RIGHT: product info ─── */}
            <div className="mt-6 lg:mt-0 space-y-5">

              {/* Stock / reserved alert */}
              {(stockWarning || listing.is_reserved) && (
                <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium border ${listing.is_reserved ? "bg-stone-50 border-stone-200 text-stone-500" : "bg-amber-50 border-amber-200 text-amber-700"}`}>
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {listing.is_reserved ? "This item is currently reserved by another user" : stockWarning}
                </div>
              )}

              {/* Category */}
              <p className="text-teal-600 text-xs tracking-[0.2em] uppercase font-bold">
                {listing.category?.title}
              </p>

              {/* Title */}
              <h1 className="text-2xl lg:text-3xl font-black text-stone-900 leading-tight" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                {listing.title}
              </h1>

              {/* Rating */}
              {totalReviews > 0 && (
                <div className="flex items-center gap-2">
                  <div className="flex gap-0.5">
                    {[1,2,3,4,5].map(s => (
                      <Star key={s} className={`w-4 h-4 ${s <= Math.round(rating) ? "fill-amber-400 text-amber-400" : "fill-stone-200 text-stone-200"}`} />
                    ))}
                  </div>
                  <span className="text-sm font-semibold text-stone-700">{rating.toFixed(1)}</span>
                  <span className="text-sm text-stone-400">({totalReviews} reviews)</span>
                </div>
              )}

              {/* Price */}
              <div className="flex items-baseline gap-3">
                {hasVariants ? (
                  <span className="text-3xl font-black text-stone-900">From ₦{minVariantPrice!.toLocaleString()}</span>
                ) : (
                  <>
                    <span className="text-3xl font-black text-stone-900">₦{displayPrice.toLocaleString()}</span>
                    {hasDiscount && (
                      <>
                        <span className="text-lg text-stone-400 line-through">₦{Number(listing.price).toLocaleString()}</span>
                        <span className="text-sm font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-lg">{discountPct}% off</span>
                      </>
                    )}
                  </>
                )}
              </div>

              {/* Description */}
              <div>
                <p className={`text-stone-500 text-sm leading-relaxed ${descExpanded ? "" : "line-clamp-3"}`}>
                  {listing.description}
                </p>
                {listing.description?.length > 160 && (
                  <button onClick={() => setDescExpanded(e => !e)} className="mt-1 text-teal-600 text-xs font-semibold flex items-center gap-0.5">
                    {descExpanded ? <><ChevronUp className="w-3.5 h-3.5" /> Show less</> : <><ChevronDown className="w-3.5 h-3.5" /> Read more</>}
                  </button>
                )}
              </div>

              {/* Item attributes */}
              {(() => {
                const l = listing as any;
                const rows: { icon: React.ReactNode; label: string; value: string }[] = [];
                if (l.brand)     rows.push({ icon:<Package className="w-3.5 h-3.5 text-teal-500"/>,   label:"Brand",     value:l.brand });
                if (l.condition) rows.push({ icon:<CheckCircle className="w-3.5 h-3.5 text-teal-500"/>,label:"Condition", value:({new:"Brand New",fairly_used:"Fairly Used",refurbished:"Refurbished"} as Record<string,string>)[l.condition]||l.condition });
                if (l.delivery_time) rows.push({ icon:<Truck className="w-3.5 h-3.5 text-teal-500"/>,  label:"Est. delivery",value:l.delivery_time });
                if (!rows.length) return null;
                return (
                  <div className="space-y-2 py-4 border-t border-stone-100">
                    {rows.map(r => (
                      <div key={r.label} className="flex items-center gap-2">
                        {r.icon}
                        <span className="text-xs text-stone-400 w-24 flex-shrink-0">{r.label}</span>
                        <span className="text-xs font-semibold text-stone-800">{r.value}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Tags */}
              {(() => {
                const tags = ((listing as any).tags as string|undefined)?.split(',').map((t:string)=>t.trim()).filter(Boolean);
                if (!tags?.length) return null;
                return (
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((tag:string) => (
                      <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-teal-50 border border-teal-100 text-teal-700 text-xs font-medium">
                        <Tag className="w-3 h-3" />{tag}
                      </span>
                    ))}
                  </div>
                );
              })()}

              {/* ── CTA: product ── */}
              {!isService && listing.is_available && (
                <div className="space-y-3 pt-2">
                  {listing.is_reserved ? (
                    <div className="w-full py-4 bg-stone-100 border border-stone-200 rounded-2xl flex items-center justify-center gap-2 text-stone-400 font-semibold cursor-not-allowed">
                      <Clock className="w-4 h-4" /> Currently Reserved
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      {/* Quantity */}
                      <div className="flex items-center border border-stone-200 rounded-xl overflow-hidden flex-shrink-0">
                        <button onClick={() => setQty(q => Math.max(1, q-1))} className="px-3 py-3 text-stone-500 hover:bg-stone-50 transition">
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="px-3 text-sm font-bold text-stone-900 min-w-[2rem] text-center">{qty}</span>
                        <button onClick={() => setQty(q => q+1)} className="px-3 py-3 text-stone-500 hover:bg-stone-50 transition">
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {/* Add to cart */}
                      <motion.button whileHover={{ scale:1.02 }} whileTap={{ scale:0.97 }}
                        onClick={handleAddToCart}
                        className="flex-1 py-3.5 text-white font-bold rounded-2xl flex items-center justify-center gap-2 text-sm shadow-lg"
                        style={{ background: TEAL }}>
                        <ShoppingCart className="w-4 h-4" /> Add to Cart
                      </motion.button>
                      {/* Share */}
                      <button onClick={handleShare} className="p-3.5 border border-stone-200 rounded-2xl text-stone-500 hover:text-teal-600 hover:border-teal-300 transition">
                        <Share2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ── CTA: service ── */}
              {isService && listing.is_available && (
                <div className="flex gap-3 pt-2">
                  <motion.button whileHover={{ scale:1.02 }} whileTap={{ scale:0.97 }}
                    onClick={openBookingWizard}
                    className="flex-1 py-3.5 text-white font-bold rounded-2xl flex items-center justify-center gap-2 text-sm shadow-lg"
                    style={{ background: TEAL }}>
                    <Calendar className="w-4 h-4" /> Book Now
                  </motion.button>
                  <button onClick={handleShare} className="p-3.5 border border-stone-200 rounded-2xl text-stone-500 hover:text-teal-600 hover:border-teal-300 transition">
                    <Share2 className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Trust badges */}
              <div className="grid grid-cols-4 gap-3 py-5 border-t border-b border-stone-100">
                {[
                  { icon: Shield,      label: "Secure Order"      },
                  { icon: BadgeCheck,  label: "Verified Vendor"   },
                  { icon: Zap,         label: "Fast Response"     },
                  { icon: CheckCircle, label: "Quality Assured"   },
                ].map(({ icon: Icon, label }) => (
                  <div key={label} className="flex flex-col items-center gap-1.5 text-center">
                    <div className="w-9 h-9 rounded-xl bg-teal-50 flex items-center justify-center">
                      <Icon className="w-4 h-4 text-teal-600" />
                    </div>
                    <p className="text-[10px] text-stone-500 font-semibold leading-tight">{label}</p>
                  </div>
                ))}
              </div>

              {/* Vendor card */}
              <div className="flex items-center gap-3 p-4 bg-stone-50 rounded-2xl border border-stone-100">
                {listing.vendor.profile_picture ? (
                  <img src={listing.vendor.profile_picture} alt={vendorName}
                    className="w-11 h-11 rounded-full object-cover flex-shrink-0 ring-2 ring-white shadow-sm" />
                ) : (
                  <div className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
                    style={{ background: TEAL }}>
                    {vendorName[0]?.toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/vendor/${listing.vendor.username}`} className="font-bold text-stone-900 text-sm hover:text-teal-600 transition truncate">
                      {vendorName}
                    </Link>
                    {badge && badge !== "none" && <VendorBadge badge={badge} size="sm" />}
                  </div>
                  {completionRate > 0 && (
                    <p className="text-xs text-stone-400">{completionRate}% completion rate</p>
                  )}
                </div>
                {unlockedConversationId ? (
                  <motion.button whileHover={{ scale:1.03 }} whileTap={{ scale:0.97 }}
                    onClick={() => setShowChat(true)}
                    className="flex items-center gap-1.5 px-3 py-2 border border-stone-200 hover:border-teal-400 text-stone-600 hover:text-teal-600 rounded-xl text-xs font-semibold transition-all flex-shrink-0">
                    <MessageCircle className="w-3.5 h-3.5" /> Message
                  </motion.button>
                ) : (
                  <motion.button whileHover={{ scale:1.03 }} whileTap={{ scale:0.97 }}
                    onClick={() => {
                      if (!isLoggedIn) { router.push("/auth"); return; }
                      if (isService) { openBookingWizard(); return; }
                      showToast("Chat becomes available after payment to protect both buyers and vendors.");
                    }}
                    title="Chat becomes available after payment to protect both buyers and vendors."
                    className="flex items-center gap-1.5 px-3 py-2 border border-stone-200 text-stone-400 rounded-xl text-xs font-semibold transition-all flex-shrink-0">
                    <Lock className="w-3.5 h-3.5" /> Chat locked
                  </motion.button>
                )}
              </div>

              {/* Admin controls */}
              {isAdmin && (
                <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-purple-600" />
                    <p className="text-purple-700 text-xs tracking-[0.2em] uppercase font-semibold">Admin Controls</p>
                    <span className={`ml-auto px-2.5 py-0.5 rounded-full text-xs font-semibold ${listing.is_available ? "bg-teal-100 text-teal-700" : "bg-amber-100 text-amber-700"}`}>
                      {listing.is_available ? "Live" : "Pending"}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleAdminToggle} disabled={!!adminLoading}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 ${listing.is_available ? "bg-amber-100 text-amber-700 hover:bg-amber-200" : "bg-teal-100 text-teal-700 hover:bg-teal-200"}`}>
                      {adminLoading==="toggle" ? "Updating…" : listing.is_available ? "Hide Listing" : "Approve & Publish"}
                    </button>
                    <button onClick={handleAdminDelete} disabled={!!adminLoading}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 ${confirmDelete ? "bg-red-500 text-white" : "bg-red-100 text-red-700 hover:bg-red-200"}`}>
                      {adminLoading==="delete" ? "Deleting…" : confirmDelete ? "Confirm Delete" : "Delete"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ══════════ BOOKING WIZARD (services) ══════════ */}
          {isService && showBookingWizard && (
            <BookingWizard
              listing={{
                id: listing.id,
                title: listing.title,
                price: listing.price,
                deal: listing.deal,
                sale_price: listing.sale_price,
                vendor: listing.vendor,
              }}
              onClose={() => setShowBookingWizard(false)}
              onSuccess={handleBookingSuccess}
            />
          )}

          {/* ══════════ BELOW FOLD ══════════ */}
          <div className="mt-16 space-y-14">

            {/* ── Reviews ── */}
            {reviews.length > 0 && (
              <section>
                <h2 className="text-xl font-black text-stone-900 mb-6" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Customer Reviews</h2>
                {/* Rating summary */}
                <div className="flex flex-col sm:flex-row items-start gap-8 mb-8 p-6 bg-stone-50 rounded-2xl border border-stone-100">
                  <div className="flex-shrink-0 text-center">
                    <p className="text-5xl font-black text-stone-900 leading-none">{rating.toFixed(1)}</p>
                    <div className="flex gap-0.5 justify-center mt-2">
                      {[1,2,3,4,5].map(s => <Star key={s} className={`w-4 h-4 ${s<=Math.round(rating)?"fill-amber-400 text-amber-400":"fill-stone-200 text-stone-200"}`} />)}
                    </div>
                    <p className="text-xs text-stone-400 mt-1">{totalReviews} review{totalReviews!==1?"s":""}</p>
                  </div>
                  {/* Breakdown bars */}
                  <div className="flex-1 w-full space-y-1.5">
                    {ratingCounts.map(({ n, count }) => {
                      const pct = totalReviews > 0 ? Math.round((count/totalReviews)*100) : 0;
                      return (
                        <div key={n} className="flex items-center gap-2.5">
                          <span className="text-xs text-stone-500 w-4 text-right flex-shrink-0">{n}</span>
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400 flex-shrink-0" />
                          <div className="flex-1 h-1.5 bg-stone-200 rounded-full overflow-hidden">
                            <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width:`${pct}%` }} />
                          </div>
                          <span className="text-xs text-stone-400 w-5 flex-shrink-0">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {/* Individual reviews */}
                <div className="space-y-5">
                  {reviews.map(review => (
                    <div key={review.id} className="pb-5 border-b border-stone-100 last:border-0 last:pb-0">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full text-white text-sm font-bold flex items-center justify-center flex-shrink-0" style={{ background: PURPLE }}>
                            {review.reviewer_username[0]?.toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-stone-900">{review.reviewer_username}</p>
                            <p className="text-xs text-stone-400">{new Date(review.created_at).toLocaleDateString("en-NG",{day:"numeric",month:"short",year:"numeric"})}</p>
                          </div>
                        </div>
                        <div className="flex gap-0.5 flex-shrink-0">
                          {[1,2,3,4,5].map(s => <Star key={s} className={`w-3.5 h-3.5 ${s<=review.rating?"fill-amber-400 text-amber-400":"fill-stone-200 text-stone-200"}`} />)}
                        </div>
                      </div>
                      {review.comment && <p className="text-sm text-stone-500 leading-relaxed pl-10">{review.comment}</p>}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── More from vendor ── */}
            {(vendorLoading || vendorListings.length > 0) && (
              <section>
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-xl font-black text-stone-900" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>More from {vendorName}</h2>
                  <Link href={`/vendor/${listing.vendor.username}`} className="text-teal-600 text-sm font-semibold hover:text-teal-700 transition">View store →</Link>
                </div>
                {vendorLoading ? <RelatedSkeleton /> : (
                  <div className="flex gap-4 overflow-x-auto pb-2" style={{ scrollbarWidth:"none" }}>
                    {vendorListings.map(item => <RelatedCard key={item.id} item={item} />)}
                  </div>
                )}
              </section>
            )}

            {/* ── Similar items ── */}
            {(similarLoading || similarItems.length > 0) && (
              <section>
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-xl font-black text-stone-900" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Similar Items</h2>
                  {listing.category?.title && (
                    <span className="px-3 py-1 rounded-full text-xs font-bold text-teal-700 bg-teal-50 border border-teal-100">{listing.category.title}</span>
                  )}
                </div>
                {similarLoading ? <RelatedSkeleton /> : (
                  <div className="flex gap-4 overflow-x-auto pb-2" style={{ scrollbarWidth:"none" }}>
                    {similarItems.map(item => <RelatedCard key={item.id} item={item} />)}
                  </div>
                )}
              </section>
            )}

            {/* ── You might also like ── */}
            {(alsoLikeLoading || alsoLike.length > 0) && (
              <section>
                <h2 className="text-xl font-black text-stone-900 mb-5" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>You May Also Like</h2>
                {alsoLikeLoading ? <RelatedSkeleton /> : (
                  <div className="flex gap-4 overflow-x-auto pb-2" style={{ scrollbarWidth:"none" }}>
                    {alsoLike.map(item => <RelatedCard key={item.id} item={item} />)}
                  </div>
                )}
              </section>
            )}

          </div>
        </div>
      </div>
    </>
  );
}
