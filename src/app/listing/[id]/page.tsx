// src/app/listing/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import {
  ArrowLeft, Star, MessageCircle, ShoppingCart, Calendar,
  Clock, FileText, CheckCircle, Loader, AlertCircle, MapPin,
  Shield, ChevronDown, ChevronUp, Send
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
  "8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM",
  "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM",
  "4:00 PM", "5:00 PM", "6:00 PM", "7:00 PM",
];

interface Listing {
  id: number;
  title: string;
  description: string;
  price: number;
  image: string;
  is_available: boolean;
  listing_type: string;
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

export default function ListingDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { isLoggedIn } = useAuth();
  const { addToCart } = useCartStore();

  const [listing, setListing] = useState<Listing | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stockWarning, setStockWarning] = useState("");

  // Chat
  const [showChat, setShowChat] = useState(false);

  // Booking
  const [showBooking, setShowBooking] = useState(false);
  const [bookingDate, setBookingDate] = useState("");
  const [bookingTime, setBookingTime] = useState("");
  const [bookingNote, setBookingNote] = useState("");
  const [bookingStep, setBookingStep] = useState<"form" | "confirming" | "done">("form");
  const [bookingError, setBookingError] = useState("");

  // Toast
  const [toast, setToast] = useState("");

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  useEffect(() => {
    const fetchListing = async () => {
      try {
        const res = await fetch(`${API_URL}/api/services/listings/${id}/`);
        if (!res.ok) throw new Error("Listing not found");
        const data = await res.json();
        setListing(data);
        // Warn if low stock
        if (data.track_inventory && data.stock_quantity <= 3 && data.stock_quantity > 0) {
          setStockWarning(`Only ${data.stock_quantity} left in stock!`);
        } else if (data.track_inventory && data.stock_quantity === 0) {
          setStockWarning("Out of stock");
        }
        // Fetch reviews for this listing
        try {
          const rv = await fetch(`${API_URL}/api/reviews/reviews/?listing=${id}`);
          if (rv.ok) {
            const rd = await rv.json();
            setReviews(Array.isArray(rd) ? rd : (rd.results || []));
          }
        } catch {}
      } catch (err: any) {
        setError(err.message || "Failed to load listing");
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchListing();
  }, [id]);

  const handleAddToCart = async () => {
    if (!listing) return;
    // Re-fetch listing to check current availability/stock
    try {
      const res = await fetch(`${API_URL}/api/services/listings/${listing.id}/`);
      if (res.ok) {
        const fresh = await res.json();
        if (!fresh.is_available) {
          showToast("Sorry, this item is no longer available!");
          setListing(fresh);
          return;
        }
        if (fresh.track_inventory && fresh.stock_quantity === 0) {
          showToast("Sorry, this item is out of stock!");
          setListing(fresh);
          return;
        }
        if (fresh.track_inventory && fresh.stock_quantity <= 3) {
          setStockWarning(`Only ${fresh.stock_quantity} left in stock!`);
        }
      }
    } catch {}
    addToCart({ id: listing.id, title: listing.title, price: listing.price, img: listing.image });
    // Store this page so cart back button returns here
    try { sessionStorage.setItem("cart-referrer", window.location.pathname); } catch {}
    showToast("Added to cart!");
  };

  const handleBooking = async () => {
    if (!isLoggedIn) { router.push("/auth"); return; }
    if (!bookingDate) { setBookingError("Please pick a date."); return; }
    if (!bookingTime) { setBookingError("Please pick a time slot."); return; }
    setBookingError("");
    setBookingStep("confirming");
    // Re-check availability before booking
    try {
      const freshRes = await fetch(`${API_URL}/api/services/listings/${listing!.id}/`);
      if (freshRes.ok) {
        const fresh = await freshRes.json();
        if (!fresh.is_available || (fresh.track_inventory && fresh.stock_quantity === 0)) {
          setBookingError("Sorry, this item is no longer available. Someone may have just booked the last one.");
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
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        // Django returns field-level errors as { field: ["message"] }
        const msg = data.detail
          || data.scheduled_date?.[0]
          || data.listing?.[0]
          || data.scheduled_time?.[0]
          || data.non_field_errors?.[0]
          || Object.values(data).flat().join(" ")
          || "Booking failed";
        throw new Error(msg);
      }

      setBookingStep("done");
    } catch (err: any) {
      setBookingError(err.message || "Could not place booking. Try again.");
      setBookingStep("form");
    }
  };

  // Min date = today
  const today = new Date().toISOString().split("T")[0];

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
      <Loader className="w-12 h-12 text-purple-600 animate-spin" />
    </div>
  );

  if (error || !listing) return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center">
        <AlertCircle className="w-14 h-14 text-red-400 mx-auto mb-3" />
        <p className="text-gray-600 dark:text-gray-400">{error || "Listing not found"}</p>
        <button onClick={() => router.back()}
          className="mt-4 px-6 py-2.5 bg-purple-600 text-white rounded-full font-bold text-sm">
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
      {/* Toast */}
      {toast && (
        <motion.div initial={{ y: -40, opacity: 0 }} animate={{ y: 70, opacity: 1 }}
          className="fixed top-0 left-1/2 -translate-x-1/2 z-50 bg-green-500 text-white px-6 py-3 rounded-full font-bold text-sm shadow-lg">
          {toast}
        </motion.div>
      )}

      {/* Chat popup */}
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

      {/* Header */}
      <div className="sticky top-0 z-40 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-3 p-4">
          <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition">
            <ArrowLeft className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          </button>
          <h1 className="font-black text-gray-900 dark:text-white text-lg truncate flex-1">{listing.title}</h1>
        </div>
      </div>

      <div className="pb-36 bg-gray-50 dark:bg-gray-950 min-h-screen">

        {/* Image */}
        <div className="relative h-64 w-full bg-gray-200 dark:bg-gray-800">
          {listing.image ? (
            <Image
              src={listing.image.startsWith("http") ? listing.image : `/images/${listing.image}`}
              alt={listing.title} fill className="object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400 text-5xl">📦</div>
          )}
          {!listing.is_available && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <span className="bg-red-600 text-white font-black px-6 py-2 rounded-full">Unavailable</span>
            </div>
          )}
        </div>

        <div className="p-4 space-y-4">

          {/* Stock warning banner */}
        {stockWarning && (
          <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-2xl p-3 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-orange-500 flex-shrink-0" />
            <p className="text-orange-700 dark:text-orange-400 text-sm font-bold">{stockWarning}</p>
          </div>
        )}

        {/* Title + Price */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <p className="text-xs text-purple-600 dark:text-purple-400 font-bold uppercase tracking-wide mb-1">
                  {listing.category?.title}
                </p>
                <h2 className="text-xl font-black text-gray-900 dark:text-white">{listing.title}</h2>
              </div>
              <p className="text-2xl font-black bg-gradient-to-r from-purple-600 to-teal-500 bg-clip-text text-transparent whitespace-nowrap">
                ₦{Number(listing.price).toLocaleString()}
              </p>
            </div>

            {/* Rating */}
            {totalReviews > 0 && (
              <div className="flex items-center gap-1.5 mt-2">
                <div className="flex">
                  {[1,2,3,4,5].map(s => (
                    <Star key={s} className={`w-4 h-4 ${s <= Math.round(rating) ? "text-amber-400 fill-amber-400" : "text-gray-200 fill-gray-200"}`} />
                  ))}
                </div>
                <span className="text-sm text-gray-500">{rating} ({totalReviews} reviews)</span>
              </div>
            )}

            <p className="text-gray-600 dark:text-gray-400 text-sm mt-3 leading-relaxed">{listing.description}</p>
          </div>

          {/* Vendor Card */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800">
            <p className="text-xs text-gray-400 font-semibold uppercase mb-3">Vendor</p>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-purple-100 to-teal-100 flex items-center justify-center font-black text-purple-600 text-lg">
                  {vendorName[0]?.toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-black text-gray-900 dark:text-white">{vendorName}</p>
                    {badge && badge !== "none" && <VendorBadge badge={badge} size="sm" />}
                  </div>
                  {completionRate > 0 && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {completionRate}% completion rate
                    </p>
                  )}
                </div>
              </div>
              {/* Message button right on vendor card */}
              <button
                onClick={() => { if (!isLoggedIn) { router.push("/auth"); return; } setShowChat(true); }}
                className="flex items-center gap-1.5 px-3 py-2 bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-xl font-bold text-sm border border-purple-100 dark:border-purple-800">
                <MessageCircle className="w-4 h-4" /> Message
              </button>
            </div>
          </div>

          {/* Trust badges */}
          <div className={`grid gap-2 ${totalReviews > 0 ? "grid-cols-3" : "grid-cols-2"}`}>
            {[
              { icon: Shield, label: "Escrow Protected", color: "text-green-600" },
              { icon: CheckCircle, label: "Vendor Verified", color: "text-blue-600" },
            ].map(({ icon: Icon, label, color }) => (
              <div key={label} className="bg-white dark:bg-gray-900 rounded-xl p-3 text-center shadow-sm border border-gray-100 dark:border-gray-800">
                <Icon className={`w-5 h-5 ${color} mx-auto mb-1`} />
                <p className="text-[10px] text-gray-500 font-medium leading-tight">{label}</p>
              </div>
            ))}
            {totalReviews > 0 && (
              <div className="bg-white dark:bg-gray-900 rounded-xl p-3 text-center shadow-sm border border-gray-100 dark:border-gray-800">
                <Star className="w-5 h-5 text-amber-500 fill-amber-500 mx-auto mb-1" />
                <p className="text-[10px] text-gray-500 font-medium leading-tight">
                  {rating.toFixed(1)} ({totalReviews})
                </p>
              </div>
            )}
          </div>

          {/* BOOKING SECTION — only for services */}
          {(listing.listing_type === "service" || !listing.listing_type) && <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
            <button
              onClick={() => setShowBooking(v => !v)}
              className="w-full flex items-center justify-between p-4 text-left">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-purple-600" />
                <span className="font-black text-gray-900 dark:text-white">Book a Date & Time</span>
              </div>
              {showBooking ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
            </button>

            <AnimatePresence>
              {showBooking && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}
                  className="overflow-hidden">
                  <div className="px-4 pb-4 space-y-4 border-t border-gray-100 dark:border-gray-800 pt-4">

                    {bookingStep === "done" ? (
                      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                        className="text-center py-4 space-y-2">
                        <CheckCircle className="w-14 h-14 text-green-500 mx-auto" />
                        <p className="font-black text-gray-900 dark:text-white text-lg">Booking Request Sent!</p>
                        <p className="text-gray-500 text-sm">The vendor will confirm your booking. You'll see it in your orders.</p>
                        <button onClick={() => router.push("/account/bookings")}
                          className="mt-2 px-6 py-2.5 bg-purple-600 text-white rounded-full font-bold text-sm">
                          View My Orders
                        </button>
                      </motion.div>
                    ) : (
                      <>
                        {/* Date picker */}
                        <div>
                          <label className="flex items-center gap-1.5 text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                            <Calendar className="w-4 h-4 text-purple-500" /> Pick a Date
                          </label>
                          <input type="date" min={today} value={bookingDate}
                            onChange={e => setBookingDate(e.target.value)}
                            className="w-full p-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:outline-none focus:border-purple-500 text-sm font-medium" />
                        </div>

                        {/* Time slots */}
                        <div>
                          <label className="flex items-center gap-1.5 text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                            <Clock className="w-4 h-4 text-purple-500" /> Pick a Time Slot
                          </label>
                          <div className="grid grid-cols-3 gap-2">
                            {TIME_SLOTS.map(slot => (
                              <button key={slot} onClick={() => setBookingTime(slot)}
                                className={`py-2 rounded-xl text-xs font-bold border-2 transition ${
                                  bookingTime === slot
                                    ? "bg-purple-600 text-white border-purple-600"
                                    : "bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-purple-300"
                                }`}>
                                {slot}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Note */}
                        <div>
                          <label className="flex items-center gap-1.5 text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                            <FileText className="w-4 h-4 text-purple-500" /> Add a Note (optional)
                          </label>
                          <textarea value={bookingNote} onChange={e => setBookingNote(e.target.value)}
                            placeholder="Any special requests or details for the vendor..."
                            rows={3}
                            className="w-full p-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:outline-none focus:border-purple-500 text-sm resize-none" />
                        </div>

                        {bookingError && (
                          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
                            <p className="text-red-600 dark:text-red-400 text-sm font-bold text-center">{bookingError}</p>
                          </div>
                        )}

                        <button
                          onClick={handleBooking}
                          disabled={bookingStep === "confirming" || !bookingDate || !bookingTime}
                          className={`w-full py-3.5 rounded-xl font-black text-white text-base flex items-center justify-center gap-2 transition ${
                            bookingStep === "confirming" || !bookingDate || !bookingTime
                              ? "bg-gray-300 dark:bg-gray-700 cursor-not-allowed opacity-60"
                              : "bg-gradient-to-r from-purple-600 to-teal-500 hover:opacity-90"
                          }`}>
                          {bookingStep === "confirming"
                            ? <><Loader className="w-5 h-5 animate-spin" /> Sending...</>
                            : <><Send className="w-5 h-5" /> Send Booking Request</>}
                        </button>

                        <p className="text-xs text-gray-400 text-center">
                          Vendor must confirm before it's finalised. Payment is only charged after confirmation.
                        </p>
                      </>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>}

        {/* REVIEWS SECTION */}
          {reviews.length > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800 mx-4 mb-4">
              <div className="flex items-center gap-2 mb-4">
                <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
                <h3 className="font-black text-gray-900 dark:text-white">Reviews ({reviews.length})</h3>
              </div>
              <div className="space-y-4">
                {reviews.map(review => (
                  <div key={review.id} className="border-b border-gray-50 dark:border-gray-800 last:border-0 pb-4 last:pb-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-sm text-gray-800 dark:text-gray-200">{review.reviewer_username}</span>
                      <div className="flex gap-0.5">
                        {[1,2,3,4,5].map(s => (
                          <Star key={s} className={`w-3.5 h-3.5 ${s <= review.rating ? "text-amber-400 fill-amber-400" : "text-gray-200 fill-gray-200"}`} />
                        ))}
                      </div>
                    </div>
                    {review.comment && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{review.comment}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(review.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Bottom Action Bar — service=Book only, food/product=Cart only */}
      {listing.is_available && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 p-4 flex gap-3">
          {listing.listing_type === "service" ? (
            // SERVICE: Book Now only
            <button onClick={() => { if (!isLoggedIn) { router.push("/auth"); return; } setShowBooking(true); window.scrollTo({ top: 9999, behavior: "smooth" }); }}
              className="flex-1 py-3.5 bg-gradient-to-r from-purple-600 to-teal-500 text-white font-black rounded-xl flex items-center justify-center gap-2 text-sm shadow-lg">
              <Calendar className="w-5 h-5" /> Book Now
            </button>
          ) : (
            // FOOD / PHYSICAL PRODUCT: Add to Cart only
            <button onClick={handleAddToCart}
              className="flex-1 py-3.5 bg-gradient-to-r from-purple-600 to-teal-500 text-white font-black rounded-xl flex items-center justify-center gap-2 text-sm shadow-lg">
              <ShoppingCart className="w-5 h-5" /> Add to Cart
            </button>
          )}
        </div>
      )}
    </>
  );
}
