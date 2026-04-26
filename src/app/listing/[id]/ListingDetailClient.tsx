"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft, Star, MessageCircle, ShoppingCart, Calendar,
  Clock, FileText, CheckCircle, AlertCircle,
  ChevronDown, ChevronUp, Send, MapPin, Sparkles
} from "lucide-react";
import { useAuth, fetchWithAuth } from "@/lib/authStore";
import { useCartStore } from "@/lib/cartStore";
import VendorBadge from "@/components/VendorBadge";
import ChatWindow from "@/components/ChatWindow";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

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
  image: string;
  is_available: boolean;
  listing_type: string;
  track_inventory?: boolean;
  stock_quantity?: number;
  category: { id: number; title: string; slug: string };
  vendor: {
    id: number;
    username: string;
    business_name?: string;
    profile?: {
      vendor_badge: "none" | "rising" | "trusted" | "top";
      completion_rate: number;
      rating: number;
      total_reviews: number;
    };
  };
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
  const { addToCart } = useCartStore();

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

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  const handleAddToCart = async () => {
    if (!listing) return;
    try {
      const res = await fetch(`${API_URL}/api/services/listings/${listing.id}/`);
      if (res.ok) {
        const fresh = await res.json();
        if (!fresh.is_available) { showToast("Sorry, this item is no longer available!"); setListing(fresh); return; }
        if (fresh.track_inventory && fresh.stock_quantity === 0) { showToast("Sorry, this item is out of stock!"); setListing(fresh); return; }
        if (fresh.track_inventory && fresh.stock_quantity <= 3) setStockWarning(`Only ${fresh.stock_quantity} left!`);
      }
    } catch {}
    addToCart({ id: listing.id, title: listing.title, price: listing.price, img: listing.image });
    try { sessionStorage.setItem("cart-referrer", window.location.pathname); } catch {}
    showToast("Added to cart!");
  };

  const handleBooking = async () => {
    if (!isLoggedIn) { router.push("/auth"); return; }
    if (!bookingDate) { setBookingError("Please pick a date."); return; }
    if (!bookingTime) { setBookingError("Please pick a time slot."); return; }
    if (!bookingLocation.trim()) { setBookingError("Please enter a location."); return; }
    setBookingError("");
    setBookingStep("confirming");

    try {
      const freshRes = await fetch(`${API_URL}/api/services/listings/${listing!.id}/`);
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
      const res = await fetchWithAuth(`${API_URL}/api/orders/bookings/`, {
        method: "POST",
        body: JSON.stringify({
          listing: listing!.id,
          scheduled_date: bookingDate,
          scheduled_time: bookingTime,
          note: bookingNote,
          location: bookingLocation.trim(),
        }),
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

  const today = new Date().toISOString().split("T")[0];
  const isService = listing?.listing_type === "service" || !listing?.listing_type;

  // ── NOT FOUND ──────────────────────────────────────────────────────────────
  if (!listing) return (
    <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center p-6"
      style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center bg-red-50">
          <AlertCircle className="w-8 h-8 text-red-400" />
        </div>
        <h3 className="text-lg font-bold text-stone-900 mb-1"
          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
          Listing not found
        </h3>
        <p className="text-stone-400 text-sm mb-4">This listing may have been removed.</p>
        <button onClick={() => router.back()}
          className="px-6 py-2.5 text-white font-medium rounded-full text-sm shadow-sm"
          style={{ background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" }}>
          Go Back
        </button>
      </div>
    </div>
  );

  const vendorName = listing.vendor.business_name || listing.vendor.username;
  const badge = listing.vendor.profile?.vendor_badge;
  const rating = listing.vendor.profile?.rating || 0;
  const totalReviews = listing.vendor.profile?.total_reviews || 0;
  const completionRate = listing.vendor.profile?.completion_rate || 0;

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

      <div className="min-h-screen bg-[#FAFAF9]" style={{ fontFamily: "'DM Sans', sans-serif" }}>

        {/* ── STICKY HEADER ── */}
        <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-stone-100 shadow-sm">
          <div className="flex items-center gap-3 px-4 py-3">
            <button onClick={() => router.back()}
              className="p-2.5 bg-white border border-stone-200 hover:border-stone-300 rounded-full shadow-sm transition-all active:scale-95 flex-shrink-0">
              <ChevronLeft className="w-5 h-5 text-stone-600" />
            </button>
            <h1 className="font-bold text-stone-900 text-base truncate flex-1"
              style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
              {listing.title}
            </h1>
          </div>
        </div>

        <div className="pb-28 max-w-2xl mx-auto">

          {/* ── HERO IMAGE ── */}
          <div className="relative h-64 w-full bg-stone-100">
            {listing.image?.startsWith("http") ? (
              <img
                src={listing.image}
                alt={listing.title}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Sparkles className="w-12 h-12 text-stone-300" />
              </div>
            )}
            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />

            {!listing.is_available && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                <span className="bg-red-500 text-white font-bold px-6 py-2 rounded-full text-sm">Unavailable</span>
              </div>
            )}
          </div>

          <div className="px-4 pt-4 space-y-4">

            {/* ── STOCK WARNING ── */}
            {stockWarning && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                <p className="text-amber-700 text-sm font-medium">{stockWarning}</p>
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
                    style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                    {listing.title}
                  </h2>
                </div>
                <p className="text-2xl font-bold whitespace-nowrap" style={{
                  background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)",
                  WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
                }}>
                  ₦{Number(listing.price).toLocaleString()}
                </p>
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
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-sm"
                    style={{ background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" }}>
                    {vendorName[0]?.toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-stone-900 text-sm">{vendorName}</p>
                      {badge && badge !== "none" && <VendorBadge badge={badge} size="sm" />}
                    </div>
                    {completionRate > 0 && (
                      <p className="text-xs text-stone-400 mt-0.5">{completionRate}% completion rate</p>
                    )}
                  </div>
                </div>
                <motion.button
                  whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  onClick={() => { if (!isLoggedIn) { router.push("/auth"); return; } setShowChat(true); }}
                  className="flex items-center gap-1.5 px-3 py-2 border border-stone-200 hover:border-teal-300 text-stone-600 hover:text-teal-600 rounded-full text-sm font-medium transition-all">
                  <MessageCircle className="w-4 h-4" /> Message
                </motion.button>
              </div>
            </div>

            {/* ── ADD TO CART — products only ── */}
            {!isService && listing.is_available && (
              <motion.button
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                onClick={handleAddToCart}
                className="w-full py-4 text-white font-semibold rounded-full flex items-center justify-center gap-2 text-base shadow-lg shadow-teal-200/60"
                style={{ background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" }}>
                <ShoppingCart className="w-5 h-5" /> Add to Cart
              </motion.button>
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
                      style={{ background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" }}>
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
                      style={{ background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" }}>
                      <Calendar className="w-4 h-4" /> Book Now
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
                              style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                              Booking Request Sent!
                            </p>
                            <p className="text-stone-400 text-sm">
                              The vendor will confirm your booking. You'll get a notification when they do.
                            </p>
                            <motion.button
                              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                              onClick={() => router.push("/account/bookings")}
                              className="mt-2 px-6 py-2.5 text-white font-medium rounded-full text-sm shadow-sm"
                              style={{ background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" }}>
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
                                    style={bookingTime === slot ? { background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" } : {}}>
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
                              style={{ background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" }}>
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

          </div>
        </div>
      </div>
    </>
  );
}