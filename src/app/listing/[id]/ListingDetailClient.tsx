"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Star, MessageCircle, ShoppingCart, Calendar,
  Clock, FileText, CheckCircle, AlertCircle,
  ChevronDown, ChevronUp, Send, MapPin, Sparkles, ZoomIn, X as XIcon,
  Shield, Share2
} from "lucide-react";
import TopNav from "@/components/layout/TopNav";
import { useAuth } from "@/lib/authStore";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { GRAD, GRAD_TEXT, SERIF } from "@/lib/tokens";
import VendorBadge from "@/components/VendorBadge";
import ChatWindow from "@/components/ChatWindow";
import { useAdminMode } from "@/hooks/useAdminMode";

interface Review {
  id: number;
  reviewer_username: string;
  rating: number;
  comment: string;
  created_at: string;
  listing_title: string;
}

const TIME_SLOTS = [
  "6:00 AM", "7:00 AM", "8:00 AM", "9:00 AM",
  "10:00 AM", "11:00 AM", "12:00 PM", "1:00 PM",
  "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM",
  "6:00 PM", "7:00 PM", "8:00 PM", "9:00 PM",
  "10:00 PM", "11:00 PM", "12:00 AM",
];

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
    vendor_badge?: "none" | "rising" | "trusted" | "top" | null;
    completion_rate?: number;
    rating?: number;
    total_reviews?: number;
  };
}

function RelatedSkeleton() {
  return (
    <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
      {[0, 1, 2].map(i => (
        <div key={i} className="w-40 flex-shrink-0 bg-stone-100 rounded-2xl h-56 animate-pulse" />
      ))}
    </div>
  );
}

function RelatedCard({ item }: { item: any }) {
  const router = useRouter();
  const isService = (item.listing_type || "").toLowerCase() === "service";
  const src = item.image?.startsWith("http") ? item.image : null;
  return (
    <div
      className="w-40 flex-shrink-0 bg-white rounded-2xl overflow-hidden shadow-sm border border-stone-100 cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => router.push(`/listing/${item.id}`)}
    >
      <div className="aspect-square bg-stone-100 overflow-hidden">
        {src ? (
          <img src={src} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ background: GRAD }}>
            <Sparkles className="w-6 h-6 text-white/60" />
          </div>
        )}
      </div>
      <div className="p-2.5">
        <p className="text-xs font-semibold text-stone-800 truncate leading-snug">{item.title}</p>
        <p className="text-sm font-bold text-teal-600 mt-0.5">₦{Number(item.price).toLocaleString()}</p>
        <button
          className="mt-2 w-full py-1.5 text-white text-xs font-bold rounded-lg"
          style={{
            background: "linear-gradient(135deg, #2DD4BF 0%, #0D9488 55%, #0f766e 100%)",
            boxShadow: "0 4px 12px rgba(13,148,136,0.35), inset 0 1px 0 rgba(255,255,255,0.25)",
          }}
          onClick={e => { e.stopPropagation(); router.push(`/listing/${item.id}`); }}
        >
          {isService ? "Book" : "Add to Cart"}
        </button>
      </div>
    </div>
  );
}

function getStockWarning(data: Listing | null): string {
  if (!data) return "";
  if (data.track_inventory && (data.stock_quantity ?? 0) <= 3 && (data.stock_quantity ?? 0) > 0) {
    return `Only ${data.stock_quantity} left in stock!`;
  }
  if (data.track_inventory && data.stock_quantity === 0) return "Out of stock";
  return "";
}

interface Props {
  id: string;
  initialListing: Listing | null;
  initialReviews: Review[];
}

export default function ListingDetailClient({ id, initialListing, initialReviews }: Props) {
  const router = useRouter();
  const { isLoggedIn } = useAuth();
  const queryClient = useQueryClient();
  const { isAdmin } = useAdminMode();
  const [adminLoading, setAdminLoading] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [listing, setListing] = useState<Listing | null>(initialListing);
  const [reviews] = useState<Review[]>(initialReviews);
  const [stockWarning, setStockWarning] = useState(() => getStockWarning(initialListing));
  const [showChat, setShowChat] = useState(false);
  const [showBooking, setShowBooking] = useState(false);
  const [bookingDate, setBookingDate] = useState("");
  const [bookingTime, setBookingTime] = useState("");
  const [bookingNote, setBookingNote] = useState("");
  const [bookingLocation, setBookingLocation] = useState("");
  const [bookingStep, setBookingStep] = useState<"form" | "confirming" | "done">("form");
  const [bookingError, setBookingError] = useState("");
  const [toast, setToast] = useState("");
  const [imageOpen, setImageOpen] = useState(false);
  const [activeImageIdx, setActiveImageIdx] = useState(0);

  const [vendorListings, setVendorListings]           = useState<any[]>([]);
  const [vendorListingsLoading, setVendorListingsLoading] = useState(false);
  const [similarItems, setSimilarItems]               = useState<any[]>([]);
  const [similarLoading, setSimilarLoading]           = useState(false);
  const [alsoLike, setAlsoLike]                       = useState<any[]>([]);
  const [alsoLikeLoading, setAlsoLikeLoading]         = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  // ── More from this vendor ─────────────────────────────────────────────────
  useEffect(() => {
    if (!listing?.vendor?.username) return;
    setVendorListingsLoading(true);
    api.pub.listings({ vendor_username: listing.vendor.username, page_size: "12" })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => {
        const items = (d.results || d || [])
          .filter((l: any) => l.id !== listing.id && l.is_available !== false)
          .slice(0, 8);
        setVendorListings(items);
      })
      .catch(() => {})
      .finally(() => setVendorListingsLoading(false));
  }, [listing?.vendor?.username, listing?.id]);

  // ── Similar items ─────────────────────────────────────────────────────────
  useEffect(() => {
    const slug = listing?.category?.slug;
    const campus = listing?.campus;
    if (!slug || !campus) return;
    setSimilarLoading(true);
    api.pub.listings({ campus, category: slug, page_size: "8" })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => {
        const items = (d.results || d || [])
          .filter((l: any) => l.id !== listing.id && l.vendor?.username !== listing.vendor?.username)
          .slice(0, 6);
        setSimilarItems(items);
      })
      .catch(() => {})
      .finally(() => setSimilarLoading(false));
  }, [listing?.category?.slug, listing?.campus, listing?.id, listing?.vendor?.username]);

  // ── You might also like ───────────────────────────────────────────────────
  useEffect(() => {
    const campus = listing?.campus;
    if (!campus) return;
    setAlsoLikeLoading(true);
    api.pub.listings({ campus, page_size: "12" })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => {
        const all = (d.results || d || []).filter((l: any) => l.id !== listing.id);
        const shuffled = [...all].sort(() => Math.random() - 0.5).slice(0, 4);
        setAlsoLike(shuffled);
      })
      .catch(() => {})
      .finally(() => setAlsoLikeLoading(false));
  }, [listing?.campus, listing?.id]);

  const handleAddToCart = async () => {
    if (!listing) return;
    if (!isLoggedIn) { router.push("/auth"); return; }

    try {
      const res = await api.cart.add({ listing_id: listing.id, quantity: 1 });

      if (!res.ok) {
        const data = await res.json();
        const msg: string = data.error || data.detail || "Could not add to cart";
        if (msg.toLowerCase().includes("reserved")) {
          setListing(prev => prev ? { ...prev, is_reserved: true } : prev);
          showToast("This item is currently reserved by another user");
        } else {
          showToast(msg);
        }
        return;
      }

      const isSingleStock = listing.track_inventory && listing.stock_quantity === 1;
      showToast(isSingleStock ? "Item reserved for 10 minutes!" : "Added to cart!");
      try { sessionStorage.setItem("cart-referrer", window.location.pathname); } catch {}
      queryClient.invalidateQueries({ queryKey: ["cart"] });
    } catch {
      showToast("Could not add to cart. Please try again.");
    }
  };

  const handleBooking = async () => {
    if (!isLoggedIn) { router.push("/auth"); return; }
    if (!bookingDate) { setBookingError("Please pick a date."); return; }
    if (!bookingTime) { setBookingError("Please pick a time slot."); return; }
    if (!bookingLocation.trim()) { setBookingError("Please enter a location."); return; }
    setBookingError("");
    setBookingStep("confirming");

    try {
      const freshRes = await api.pub.listing(listing!.id);
      if (freshRes.ok) {
        const fresh = await freshRes.json();
        if (!fresh.is_available || (fresh.track_inventory && fresh.stock_quantity === 0)) {
          setBookingError("Sorry, this item is no longer available.");
          setBookingStep("form");
          setListing(fresh);
          return;
        }
      }
    } catch {}

    try {
      const res = await api.orders.createBooking({
        listing: listing!.id,
        scheduled_date: bookingDate,
        scheduled_time: bookingTime,
        note: bookingNote,
        location: bookingLocation.trim(),
      });
      if (!res.ok) {
        const data = await res.json();
        const msg = data.detail || data.scheduled_date?.[0] || data.listing?.[0]
          || data.scheduled_time?.[0] || data.location?.[0]
          || data.non_field_errors?.[0]
          || Object.values(data).flat().join(" ") || "Booking failed";
        throw new Error(msg);
      }
      setBookingStep("done");
    } catch (err: unknown) {
      setBookingError(err instanceof Error ? err.message : "Could not place booking. Try again.");
      setBookingStep("form");
    }
  };

  const openBooking = () => {
    if (!isLoggedIn) { router.push("/auth"); return; }
    setShowBooking(true);
    setTimeout(() => {
      document.getElementById("booking-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
  };

  const handleAdminToggle = async () => {
    if (!listing) return;
    setAdminLoading("toggle");
    try {
      const res = await api.admin.updateListing(listing.id, { is_available: !listing.is_available });
      if (!res.ok) throw new Error("Failed to update listing");
      const updated = await res.json();
      setListing(prev => prev ? { ...prev, is_available: updated.is_available } : prev);
      showToast(updated.is_available ? "Listing approved and live!" : "Listing hidden from marketplace");
    } catch {
      showToast("Failed to update listing");
    } finally {
      setAdminLoading(null);
    }
  };

  const handleAdminDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setAdminLoading("delete");
    try {
      const res = await api.admin.deleteListing(listing!.id);
      if (!res.ok && res.status !== 204) throw new Error("Failed to delete listing");
      showToast("Listing deleted");
      setTimeout(() => router.back(), 1200);
    } catch {
      showToast("Failed to delete listing");
      setAdminLoading(null);
      setConfirmDelete(false);
    }
  };

  const today = new Date().toISOString().split("T")[0];
  const isService = (listing?.listing_type || "").toLowerCase() === "service";

  // ── NOT FOUND ──────────────────────────────────────────────────────────────
  if (!listing) return (
    <div className="min-h-screen bg-[#F5F5F5] flex items-center justify-center p-6"
      style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center bg-red-50">
          <AlertCircle className="w-8 h-8 text-red-400" />
        </div>
        <h3 className="text-lg font-bold text-stone-900 mb-1"
          style={SERIF}>
          Listing not found
        </h3>
        <p className="text-stone-400 text-sm mb-4">This listing may have been removed.</p>
        <button onClick={() => router.back()}
          className="px-6 py-2.5 text-white font-medium rounded-full text-sm shadow-sm"
          style={{ background: GRAD }}>
          Go Back
        </button>
      </div>
    </div>
  );

  const vendorName = listing.vendor.business_name || listing.vendor.username;
  const badge = listing.vendor.vendor_badge;
  const rating = Number(listing.vendor.rating) || 0;
  const totalReviews = Number(listing.vendor.total_reviews) || 0;
  const completionRate = Number(listing.vendor.completion_rate) || 0;

  return (
    <>
      {/* ── TOAST ── */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ y: -40, opacity: 0 }} animate={{ y: 70, opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed top-0 left-1/2 -translate-x-1/2 z-50 bg-teal-600 text-white px-6 py-3 rounded-full font-medium text-sm shadow-lg">
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── CHAT WINDOW ── */}
      {showChat && (
        <ChatWindow
          sellerId={listing.vendor.id}
          sellerName={vendorName}
          listingId={listing.id}
          productName={listing.title}
          originalPrice={listing.price}
          onClose={() => setShowChat(false)}
        />
      )}

      <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>

        <TopNav showBack />

        <div className="pb-28 max-w-2xl mx-auto">

          {/* ── IMAGE GALLERY ── */}
          {(() => {
            const allImages = [
              (listing as any).image, (listing as any).image2, (listing as any).image3,
              (listing as any).image4, (listing as any).image5,
            ].filter((img): img is string => !!img && img.startsWith('http'));
            const activeImg = allImages[activeImageIdx] ?? null;
            return (
              <div>
                {/* Main image */}
                <div
                  className={`relative w-full bg-stone-100 ${activeImg ? "cursor-zoom-in" : "h-48"}`}
                  onClick={() => activeImg && setImageOpen(true)}
                >
                  {activeImg ? (
                    <img src={activeImg} alt={listing.title} loading="lazy" decoding="async" className="w-full max-h-[280px] object-contain" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Sparkles className="w-12 h-12 text-stone-300" />
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/30 to-transparent pointer-events-none" />
                  {activeImg && (
                    <div className="absolute bottom-3 right-3 bg-black/40 backdrop-blur-sm rounded-full p-1.5">
                      <ZoomIn className="w-4 h-4 text-white" />
                    </div>
                  )}
                  {!listing.is_available && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <span className="bg-red-500 text-white font-bold px-6 py-2 rounded-full text-sm">Unavailable</span>
                    </div>
                  )}
                </div>
                {/* Thumbnails */}
                {allImages.length > 1 && (
                  <div className="flex gap-2 px-4 pt-2 overflow-x-auto hide-scrollbar">
                    {allImages.map((img, idx) => (
                      <button
                        key={idx}
                        onClick={() => setActiveImageIdx(idx)}
                        className={`flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden border-2 transition ${activeImageIdx === idx ? 'border-teal-500' : 'border-transparent opacity-60 hover:opacity-100'}`}
                      >
                        <img src={img} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── IMAGE LIGHTBOX ── */}
          <AnimatePresence>
            {imageOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4"
                onClick={() => setImageOpen(false)}
              >
                <button
                  onClick={() => setImageOpen(false)}
                  className="absolute top-4 right-4 w-10 h-10 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center transition z-10"
                >
                  <XIcon className="w-5 h-5 text-white" />
                </button>
                <motion.img
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  src={[listing.image,(listing as any).image2,(listing as any).image3,(listing as any).image4,(listing as any).image5].filter(Boolean)[activeImageIdx] ?? listing.image ?? ''}
                  alt={listing.title}
                  className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
                  onClick={(e) => e.stopPropagation()}
                />
              </motion.div>
            )}
          </AnimatePresence>

          <div className="px-4 pt-4 space-y-4">

            {/* ── STOCK WARNING / RESERVED ── */}
            {(stockWarning || listing.is_reserved) && (
              <div className={`border rounded-2xl p-3 flex items-center gap-2 ${listing.is_reserved ? "bg-stone-50 border-stone-200" : "bg-amber-50 border-amber-200"}`}>
                <AlertCircle className={`w-4 h-4 flex-shrink-0 ${listing.is_reserved ? "text-stone-400" : "text-amber-500"}`} />
                <p className={`text-sm font-medium ${listing.is_reserved ? "text-stone-500" : "text-amber-700"}`}>
                  {listing.is_reserved ? "This item is currently reserved by another user" : stockWarning}
                </p>
              </div>
            )}

            {/* ── ADMIN CONTROLS ── */}
            {isAdmin && (
              <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-purple-600" />
                  <p className="text-purple-700 text-xs tracking-[0.2em] uppercase font-semibold">Admin Controls</p>
                  <span className={`ml-auto px-2.5 py-0.5 rounded-full text-xs font-semibold ${listing.is_available ? "bg-teal-100 text-teal-700" : "bg-amber-100 text-amber-700"}`}>
                    {listing.is_available ? "Live" : "Pending Approval"}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleAdminToggle}
                    disabled={!!adminLoading}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 ${listing.is_available ? "bg-amber-100 text-amber-700 hover:bg-amber-200" : "bg-teal-100 text-teal-700 hover:bg-teal-200"}`}
                  >
                    {adminLoading === "toggle"
                      ? <span className="flex items-center justify-center gap-1.5"><span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin inline-block" />Updating...</span>
                      : listing.is_available ? "Hide Listing" : "Approve & Publish"}
                  </button>
                  <button
                    onClick={handleAdminDelete}
                    disabled={!!adminLoading}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 ${confirmDelete ? "bg-red-500 text-white hover:bg-red-600" : "bg-red-100 text-red-700 hover:bg-red-200"}`}
                  >
                    {adminLoading === "delete"
                      ? <span className="flex items-center justify-center gap-1.5"><span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin inline-block" />Deleting...</span>
                      : confirmDelete ? "Confirm Delete" : "Delete Listing"}
                  </button>
                </div>
                {confirmDelete && (
                  <p className="text-xs text-red-500 text-center">Tap &quot;Confirm Delete&quot; again to permanently remove this listing</p>
                )}
              </div>
            )}

            {/* ── TITLE + PRICE ── */}
            <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p className="text-teal-600 text-xs tracking-[0.2em] uppercase font-semibold mb-1">
                    {listing.category?.title}
                  </p>
                  <h2 className="text-xl font-bold text-stone-900"
                    style={SERIF}>
                    {listing.title}
                  </h2>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {(() => {
                    // Admin deal takes priority, then vendor discount
                    const effectivePrice = listing.deal?.discounted_price ?? listing.sale_price ?? null;
                    const discountPct = listing.deal?.discount_percent ?? listing.discount_percent ?? 0;
                    if (effectivePrice !== null && effectivePrice < listing.price) {
                      return (
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-xs text-stone-400 line-through">₦{Number(listing.price).toLocaleString()}</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full">-{discountPct}%</span>
                            <p className="text-2xl font-bold whitespace-nowrap text-red-600">
                              ₦{Number(effectivePrice).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <p className="text-2xl font-bold whitespace-nowrap" style={GRAD_TEXT}>
                        ₦{Number(listing.price).toLocaleString()}
                      </p>
                    );
                  })()}
                  <button
                    onClick={async () => {
                      const url = window.location.href;
                      const effectivePrice = listing.deal?.discounted_price ?? listing.sale_price ?? listing.price;
                      const price = `₦${Number(effectivePrice).toLocaleString()}`;
                      if (navigator.share) {
                        await navigator.share({ title: `${listing.title} — ${price}`, url }).catch(() => {});
                      } else {
                        await navigator.clipboard.writeText(url);
                        showToast("Link copied!");
                      }
                    }}
                    className="flex items-center gap-1.5 text-xs text-stone-500 hover:text-teal-600 transition"
                  >
                    <Share2 className="w-4 h-4" />
                    Share
                  </button>
                </div>
              </div>

              {totalReviews > 0 && (
                <div className="flex items-center gap-1.5 mt-3">
                  <div className="flex">
                    {[1,2,3,4,5].map(s => (
                      <Star key={s} className={`w-4 h-4 ${s <= Math.round(rating) ? "text-amber-400 fill-amber-400" : "text-stone-200 fill-stone-200"}`} />
                    ))}
                  </div>
                  <span className="text-sm text-stone-500">{rating} ({totalReviews} reviews)</span>
                </div>
              )}

              <p className="text-stone-500 text-sm mt-3 leading-relaxed">{listing.description}</p>
            </div>

            {/* ── VENDOR CARD ── */}
            <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
              <p className="text-teal-600 text-xs tracking-[0.2em] uppercase font-semibold mb-3">Vendor</p>
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-sm flex-shrink-0"
                  style={{ background: GRAD }}>
                  {vendorName[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  {/* Name + Message button on same row */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-stone-900 text-sm">{vendorName}</p>
                        {badge && badge !== "none" && <VendorBadge badge={badge} size="sm" />}
                      </div>
                      {completionRate > 0 && (
                        <p className="text-xs text-stone-400 mt-0.5">{completionRate}% completion rate</p>
                      )}
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                      onClick={() => { if (!isLoggedIn) { router.push("/auth"); return; } setShowChat(true); }}
                      className="flex items-center gap-1.5 px-3 py-2 border border-stone-200 hover:border-teal-300 text-stone-600 hover:text-teal-600 rounded-full text-sm font-medium transition-all flex-shrink-0">
                      <MessageCircle className="w-4 h-4" /> Message
                    </motion.button>
                  </div>
                  {/* Location */}
                  {listing.vendor.hostel && (
                    <div className="flex items-center gap-0.5 mt-1">
                      <MapPin className="w-3 h-3 text-teal-400 flex-shrink-0" />
                      <span className="text-xs text-stone-400">{listing.vendor.hostel}</span>
                    </div>
                  )}
                  {/* Active hours — full width so text wraps cleanly */}
                  {(() => {
                    const days: string[] = (listing.vendor as any)?.profile?.available_days || [];
                    const open: string | null = (listing.vendor as any)?.profile?.opening_time ?? null;
                    const close: string | null = (listing.vendor as any)?.profile?.closing_time ?? null;
                    if (!days.length && !open) return null;
                    const fmt = (t: string) => {
                      const [h, m] = t.split(':');
                      const hr = parseInt(h);
                      return `${hr % 12 || 12}:${m}${hr < 12 ? 'am' : 'pm'}`;
                    };
                    return (
                      <div className="flex items-start gap-0.5 mt-1">
                        <Clock className="w-3 h-3 text-teal-400 flex-shrink-0 mt-0.5" />
                        <span className="text-xs text-stone-400">
                          {days.join(', ')}{open && close ? ` · ${fmt(open)}–${fmt(close)}` : ''}
                        </span>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* ── ADD TO CART — products only ── */}
            {!isService && listing.is_available && (
              listing.is_reserved ? (
                <div className="w-full py-4 bg-stone-100 border border-stone-200 rounded-full flex items-center justify-center gap-2 text-stone-400 font-semibold text-base cursor-not-allowed select-none">
                  <Clock className="w-5 h-5" /> Reserved
                </div>
              ) : (
                <motion.button
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                  onClick={handleAddToCart}
                  className="w-full py-4 text-white font-semibold rounded-full flex items-center justify-center gap-2 text-base shadow-lg shadow-teal-200/60"
                  style={{ background: GRAD }}>
                  <ShoppingCart className="w-5 h-5" /> Add to Cart
                </motion.button>
              )
            )}

            {/* ── TRUST BADGES ── */}
            <div className={`grid gap-3 ${totalReviews > 0 ? "grid-cols-2" : "grid-cols-1"}`}>
              <div className="bg-white border border-stone-200 rounded-2xl p-3 text-center shadow-sm">
                <CheckCircle className="w-5 h-5 text-teal-500 mx-auto mb-1" />
                <p className="text-xs text-stone-500 font-medium">Vendor Verified</p>
              </div>
              {totalReviews > 0 && (
                <div className="bg-white border border-stone-200 rounded-2xl p-3 text-center shadow-sm">
                  <Star className="w-5 h-5 text-amber-400 fill-amber-400 mx-auto mb-1" />
                  <p className="text-xs text-stone-500 font-medium">{rating.toFixed(1)} ({totalReviews} reviews)</p>
                </div>
              )}
            </div>

            {/* ── BOOKING SECTION — services only ── */}
            {isService && (
              <div id="booking-section"
                className="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden">

                <button
                  onClick={() => setShowBooking(v => !v)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-stone-50 transition">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ background: GRAD }}>
                      <Calendar className="w-4 h-4 text-white" />
                    </div>
                    <span className="font-semibold text-stone-900 text-sm">Book a Date & Time</span>
                  </div>
                  {showBooking
                    ? <ChevronUp className="w-5 h-5 text-stone-400" />
                    : <ChevronDown className="w-5 h-5 text-stone-400" />}
                </button>

                {!showBooking && listing.is_available && (
                  <div className="px-4 pb-4">
                    <motion.button
                      whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                      onClick={openBooking}
                      className="w-full py-3.5 text-white font-semibold rounded-full flex items-center justify-center gap-2 text-sm shadow-lg shadow-teal-200/60"
                      style={{ background: GRAD }}>
                      <Calendar className="w-4 h-4" /> Book
                    </motion.button>
                  </div>
                )}

                <AnimatePresence>
                  {showBooking && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden">
                      <div className="px-4 pb-6 space-y-4 border-t border-stone-100 pt-4">

                        {bookingStep === "done" ? (
                          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                            className="text-center py-6 space-y-3">
                            <div className="w-16 h-16 mx-auto rounded-full bg-teal-50 flex items-center justify-center">
                              <CheckCircle className="w-8 h-8 text-teal-500" />
                            </div>
                            <p className="font-bold text-stone-900 text-lg"
                              style={SERIF}>
                              Booking Request Sent!
                            </p>
                            <p className="text-stone-400 text-sm">
                              The vendor will confirm your booking. You'll get a notification when they do.
                            </p>
                            <motion.button
                              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                              onClick={() => router.push("/account/bookings")}
                              className="mt-2 px-6 py-2.5 text-white font-medium rounded-full text-sm shadow-sm"
                              style={{ background: GRAD }}>
                              View My Bookings
                            </motion.button>
                          </motion.div>
                        ) : (
                          <>
                            {/* Date */}
                            <div>
                              <label className="flex items-center gap-1.5 text-xs text-stone-500 font-semibold uppercase tracking-wide mb-2">
                                <Calendar className="w-3.5 h-3.5 text-teal-500" /> Pick a Date
                              </label>
                              <input type="date" min={today} value={bookingDate}
                                onChange={e => setBookingDate(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl border border-stone-200 text-stone-900 text-sm focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30 transition bg-white" />
                            </div>

                            {/* Time slots */}
                            <div>
                              <label className="flex items-center gap-1.5 text-xs text-stone-500 font-semibold uppercase tracking-wide mb-2">
                                <Clock className="w-3.5 h-3.5 text-teal-500" /> Pick a Time Slot
                              </label>
                              <div className="grid grid-cols-3 gap-2">
                                {TIME_SLOTS.map(slot => (
                                  <button key={slot} type="button" onClick={() => setBookingTime(slot)}
                                    className={`py-2 rounded-xl text-xs font-medium border transition ${
                                      bookingTime === slot
                                        ? "text-white border-transparent shadow-sm"
                                        : "bg-stone-50 text-stone-600 border-stone-200 hover:border-teal-300"
                                    }`}
                                    style={bookingTime === slot ? { background: GRAD } : {}}>
                                    {slot}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Location */}
                            <div>
                              <label className="flex items-center gap-1.5 text-xs text-stone-500 font-semibold uppercase tracking-wide mb-2">
                                <MapPin className="w-3.5 h-3.5 text-teal-500" /> Location
                              </label>
                              <input
                                type="text"
                                value={bookingLocation}
                                onChange={e => setBookingLocation(e.target.value)}
                                placeholder="e.g. Cedar hostel, room 12"
                                className="w-full px-4 py-3 rounded-xl border border-stone-200 text-stone-900 text-sm focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30 transition bg-white placeholder:text-stone-400"
                              />
                              <p className="text-xs text-stone-400 mt-1">Where should the vendor meet you?</p>
                            </div>

                            {/* Note */}
                            <div>
                              <label className="flex items-center gap-1.5 text-xs text-stone-500 font-semibold uppercase tracking-wide mb-2">
                                <FileText className="w-3.5 h-3.5 text-teal-500" /> Note (optional)
                              </label>
                              <textarea value={bookingNote} onChange={e => setBookingNote(e.target.value)}
                                placeholder="Any special requests or details..."
                                rows={3}
                                className="w-full px-4 py-3 rounded-xl border border-stone-200 text-stone-900 text-sm focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30 transition bg-white placeholder:text-stone-400 resize-none" />
                            </div>

                            {/* Error */}
                            {bookingError && (
                              <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                                <p className="text-red-600 text-sm font-medium">{bookingError}</p>
                              </div>
                            )}

                            {/* Submit */}
                            <motion.button
                              whileHover={{ scale: bookingStep === "confirming" ? 1 : 1.02 }}
                              whileTap={{ scale: 0.97 }}
                              onClick={handleBooking}
                              disabled={bookingStep === "confirming" || !bookingDate || !bookingTime || !bookingLocation.trim()}
                              className="w-full py-4 rounded-full font-semibold text-white text-sm flex items-center justify-center gap-2 shadow-lg shadow-teal-200/60 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                              style={{ background: GRAD }}>
                              {bookingStep === "confirming"
                                ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" /> Sending...</>
                                : <><Send className="w-4 h-4" /> Send Booking Request</>}
                            </motion.button>

                            <p className="text-xs text-stone-400 text-center">
                              Vendor must confirm before it's finalised. You'll receive reminders at 30, 15, 10 and 5 minutes before your appointment.
                            </p>
                          </>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* ── REVIEWS ── */}
            {reviews.length > 0 && (
              <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                  <p className="text-teal-600 text-xs tracking-[0.2em] uppercase font-semibold">
                    Reviews ({reviews.length})
                  </p>
                </div>
                <div className="space-y-4">
                  {reviews.map(review => (
                    <div key={review.id} className="border-b border-stone-100 last:border-0 pb-4 last:pb-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-sm text-stone-900">{review.reviewer_username}</span>
                        <div className="flex gap-0.5">
                          {[1,2,3,4,5].map(s => (
                            <Star key={s} className={`w-3.5 h-3.5 ${s <= review.rating ? "text-amber-400 fill-amber-400" : "text-stone-200 fill-stone-200"}`} />
                          ))}
                        </div>
                      </div>
                      {review.comment && (
                        <p className="text-sm text-stone-500 mt-1 leading-relaxed">{review.comment}</p>
                      )}
                      <p className="text-xs text-stone-400 mt-1">
                        {new Date(review.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── MORE FROM VENDOR ── */}
            {(vendorListingsLoading || vendorListings.length > 0) && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="font-bold text-stone-900 text-sm">More from @{listing.vendor.username}</p>
                  <Link href={`/vendor/${listing.vendor.username}`} className="text-teal-600 text-xs font-semibold hover:text-teal-700 transition">
                    View all →
                  </Link>
                </div>
                {vendorListingsLoading ? <RelatedSkeleton /> : (
                  <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
                    {vendorListings.map(item => <RelatedCard key={item.id} item={item} />)}
                  </div>
                )}
              </div>
            )}

            {/* ── SIMILAR ITEMS ── */}
            {(similarLoading || similarItems.length > 0) && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <p className="font-bold text-stone-900 text-sm">Similar Items</p>
                  {listing.category?.title && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold text-teal-700 bg-teal-50 border border-teal-100">
                      {listing.category.title}
                    </span>
                  )}
                </div>
                {similarLoading ? <RelatedSkeleton /> : (
                  <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
                    {similarItems.map(item => <RelatedCard key={item.id} item={item} />)}
                  </div>
                )}
              </div>
            )}

            {/* ── YOU MIGHT ALSO LIKE ── */}
            {(alsoLikeLoading || alsoLike.length > 0) && (
              <div>
                <p className="font-bold text-stone-900 text-sm mb-3">You might also like</p>
                {alsoLikeLoading ? <RelatedSkeleton /> : (
                  <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
                    {alsoLike.map(item => <RelatedCard key={item.id} item={item} />)}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  );
}