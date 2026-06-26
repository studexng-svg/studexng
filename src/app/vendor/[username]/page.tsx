"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Star, Sparkles, MapPin, Shield, BellRing, UserX, X as XIcon,
  Clock, Share2, MessageCircle, CheckCircle, Calendar, Zap,
  ShoppingCart, Package, ChevronRight, Award, TrendingUp,
} from "lucide-react";
import TopNav from "@/components/layout/TopNav";
import Link from "next/link";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { GRAD, GRAD_TEXT, SERIF } from "@/lib/tokens";
import { useAdminMode } from "@/hooks/useAdminMode";
import { useCart } from "@/lib/cartStore";
import { useAuth } from "@/lib/authStore";

function VerifiedTick() {
  return (
    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full flex-shrink-0" style={{ background: "#10b981" }} title="Verified Vendor">
      <svg viewBox="0 0 12 12" className="w-2.5 h-2.5" fill="none">
        <path d="M2.5 6L4.5 8.5L9.5 3.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
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
  return <img src={src} alt={alt} loading="lazy" className={`w-full h-full object-cover ${className || ""}`} onError={() => setError(true)} />;
}

const BADGE_META: Record<string, { label: string; icon: string; cls: string }> = {
  top:     { label: "Top Vendor",     icon: "🏆", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  trusted: { label: "Trusted Vendor", icon: "✅", cls: "bg-teal-50 text-teal-700 border-teal-200" },
  rising:  { label: "Rising Vendor",  icon: "⭐", cls: "bg-purple-50 text-purple-700 border-purple-200" },
};

const DAY_LABELS: Record<string, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};

function StarBar({ rating, total }: { rating: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-0.5">
        {[1,2,3,4,5].map(n => (
          <Star key={n} className={`w-3.5 h-3.5 ${n <= Math.round(rating) ? "fill-amber-400 text-amber-400" : "text-stone-200 fill-stone-200"}`} />
        ))}
      </div>
      <span className="text-sm font-bold text-stone-900">{rating.toFixed(1)}</span>
      <span className="text-sm text-stone-400">({total})</span>
    </div>
  );
}

export default function VendorProfilePage() {
  const params = useParams();
  const router = useRouter();
  const username = params.username as string;
  const { isAdmin } = useAdminMode();
  const { user } = useAuth();
  const { addToCart, cart } = useCart();

  const [vendor, setVendor]       = useState<any>(null);
  const [listings, setListings]   = useState<any[]>([]);
  const [reviews, setReviews]     = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [toast, setToast]         = useState("");
  const [adminLoading, setAdminLoading] = useState<string | null>(null);
  const [adminToast, setAdminToast]     = useState("");
  const [notifyOpen, setNotifyOpen]     = useState(false);
  const [notifyTitle, setNotifyTitle]   = useState("");
  const [notifyMessage, setNotifyMessage] = useState("");
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const scrollKey = `vendor_scroll:${username}`;

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2000); };
  const showAdminToast = (msg: string) => { setAdminToast(msg); setTimeout(() => setAdminToast(""), 2500); };

  useEffect(() => {
    const load = async () => {
      try {
        const [vRes, lRes] = await Promise.all([
          api.pub.vendor(username),
          api.pub.listings({ vendor_username: username, page_size: "100" }),
        ]);
        let v: any = null;
        if (vRes.ok) { v = await vRes.json(); setVendor(v); }
        if (lRes.ok) { const d = await lRes.json(); setListings(d.results || d || []); }
        if (v?.id) {
          const rRes = await api.pub.reviews({ vendor: String(v.id), page_size: "8" });
          if (rRes.ok) { const rd = await rRes.json(); setReviews(rd.results || rd || []); }
        }
      } catch {}
      finally {
        setLoading(false);
        const saved = sessionStorage.getItem(scrollKey);
        if (saved) {
          const y = parseInt(saved, 10);
          sessionStorage.removeItem(scrollKey);
          if (y > 0) requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)));
        }
      }
    };
    load();
    const handleClick = (e: MouseEvent) => {
      const href = (e.target as Element).closest("a")?.getAttribute("href") ?? "";
      if (href.startsWith("/listing/")) sessionStorage.setItem(scrollKey, String(window.scrollY));
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [username, scrollKey]);

  const handleShare = async () => {
    const url = `${window.location.origin}/vendor/${username}`;
    if (navigator.share) {
      await navigator.share({ title: vendor?.business_name || username, url }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(url);
      showToast("Store link copied!");
    }
  };

  const handleRevokeVendor = async () => {
    if (!vendor?.id) return;
    if (!confirmRevoke) { setConfirmRevoke(true); return; }
    setAdminLoading("revoke");
    try {
      const res = await api.admin.updateUser(vendor.id, { user_type: "student" });
      if (!res.ok) throw new Error();
      showAdminToast("Vendor status revoked");
      setConfirmRevoke(false);
    } catch { showAdminToast("Failed to revoke vendor status"); }
    finally { setAdminLoading(null); }
  };

  const handleSendNotification = async () => {
    if (!vendor?.id || !notifyTitle.trim() || !notifyMessage.trim()) return;
    setAdminLoading("notify");
    try {
      const res = await api.admin.notifyUser(vendor.id, { title: notifyTitle.trim(), message: notifyMessage.trim() });
      if (!res.ok) throw new Error();
      showAdminToast("Notification sent!");
      setNotifyOpen(false); setNotifyTitle(""); setNotifyMessage("");
    } catch { showAdminToast("Failed to send notification"); }
    finally { setAdminLoading(null); }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <TopNav showBack activeNav="vendors" />
        <div className="max-w-2xl mx-auto px-4 pt-4 space-y-4">
          {/* Cover skeleton */}
          <div className="bg-white rounded-2xl overflow-hidden animate-pulse">
            <div className="h-32 bg-stone-100" />
            <div className="px-5 pb-5 -mt-10">
              <div className="w-20 h-20 rounded-full bg-stone-200 border-4 border-white mb-3" />
              <div className="h-5 bg-stone-100 rounded w-40 mb-2" />
              <div className="h-3.5 bg-stone-100 rounded w-24 mb-4" />
              <div className="flex gap-4">
                {[0,1,2].map(i => <div key={i} className="flex-1 h-12 bg-stone-100 rounded-xl" />)}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[0,1,2,3].map(i => (
              <div key={i} className="bg-white rounded-xl overflow-hidden animate-pulse">
                <div className="aspect-square bg-stone-100" />
                <div className="p-3 space-y-2">
                  <div className="h-3 bg-stone-100 rounded w-3/4" />
                  <div className="h-3 bg-stone-100 rounded w-1/2" />
                  <div className="h-4 bg-stone-100 rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!vendor) {
    return (
      <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <TopNav showBack activeNav="vendors" />
        <div className="max-w-2xl mx-auto px-4 pt-16 text-center">
          <Sparkles className="w-12 h-12 text-stone-200 mx-auto mb-3" />
          <p className="text-stone-500 font-semibold">Vendor not found</p>
        </div>
      </div>
    );
  }

  const badge = vendor.vendor_badge && vendor.vendor_badge !== "none" ? BADGE_META[vendor.vendor_badge] : null;
  const initials = (vendor.business_name || vendor.username || "??").slice(0, 2).toUpperCase();
  const respMins: number | null = vendor.avg_response_minutes ?? null;
  const respLabel = respMins === null ? null
    : respMins < 60 ? `~${respMins} min`
    : respMins < 1440 ? `~${Math.round(respMins / 60)} hr`
    : `~${Math.round(respMins / 1440)}d`;

  const availableDays: string[] = vendor.available_days || [];
  const openTime: string | null = vendor.opening_time || null;
  const closeTime: string | null = vendor.closing_time || null;

  const availableListings = listings.filter(l => l.is_available);
  const unavailableListings = listings.filter(l => !l.is_available);
  const sortedListings = [...availableListings, ...unavailableListings];

  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <TopNav showBack activeNav="vendors" />

      {/* Toast */}
      {toast && (
        <motion.div initial={{ y: -50, opacity: 0 }} animate={{ y: 60, opacity: 1 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-full shadow-lg z-50 text-sm font-medium text-white"
          style={{ background: GRAD }}>
          {toast}
        </motion.div>
      )}
      {adminToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-purple-700 text-white px-6 py-3 rounded-full font-medium text-sm shadow-lg">
          {adminToast}
        </div>
      )}

      {/* Admin notify modal */}
      {notifyOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center p-4 pb-24">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="font-bold text-stone-900">Send Notification</p>
              <button onClick={() => setNotifyOpen(false)} className="p-1.5 rounded-full hover:bg-stone-100"><XIcon className="w-4 h-4 text-stone-500" /></button>
            </div>
            <input value={notifyTitle} onChange={e => setNotifyTitle(e.target.value)} placeholder="Title"
              className="w-full px-4 py-3 rounded-xl border border-stone-200 text-sm focus:outline-none focus:border-purple-400" />
            <textarea value={notifyMessage} onChange={e => setNotifyMessage(e.target.value)} placeholder="Message" rows={3}
              className="w-full px-4 py-3 rounded-xl border border-stone-200 text-sm focus:outline-none focus:border-purple-400 resize-none" />
            <button onClick={handleSendNotification} disabled={!!adminLoading || !notifyTitle.trim() || !notifyMessage.trim()}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 transition-all">
              {adminLoading === "notify" ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 pt-4 pb-28 space-y-4">

        {/* ── HERO CARD ── */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl overflow-hidden shadow-sm border border-stone-100">

          {/* Cover banner */}
          <div className="h-28 relative" style={{ background: "linear-gradient(135deg,#0f766e 0%,#0D9488 40%,#6D28D9 100%)" }}>
            {vendor.is_online && (
              <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-white text-xs font-semibold">Online now</span>
              </div>
            )}
          </div>

          <div className="px-5 pb-5">
            {/* Avatar — overlaps cover */}
            <div className="flex items-end justify-between -mt-10 mb-3">
              <div className="w-20 h-20 rounded-2xl overflow-hidden border-4 border-white shadow-md flex-shrink-0">
                {vendor.profile_picture
                  ? <img src={vendor.profile_picture} alt={vendor.username} className="w-full h-full object-cover object-top" />
                  : <div className="w-full h-full flex items-center justify-center text-white font-black text-xl" style={{ background: GRAD }}>{initials}</div>
                }
              </div>
              {/* Action buttons */}
              <div className="flex items-center gap-2 mt-2">
                <button onClick={handleShare}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 transition text-stone-700 text-xs font-semibold">
                  <Share2 className="w-3.5 h-3.5" /> Share
                </button>
                <Link href={`/chat?vendor=${vendor.username}`}>
                  <button className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-white text-xs font-semibold transition"
                    style={{ background: GRAD }}>
                    <MessageCircle className="w-3.5 h-3.5" /> Chat
                  </button>
                </Link>
              </div>
            </div>

            {/* Name + badge */}
            <div className="flex flex-wrap items-center gap-2 mb-0.5">
              <h1 className="text-xl font-black text-stone-900" style={SERIF}>{vendor.business_name || vendor.username}</h1>
              <VerifiedTick />
              {badge && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${badge.cls}`}>
                  {badge.icon} {badge.label}
                </span>
              )}
            </div>
            <p className="text-stone-400 text-sm mb-3">@{vendor.username}</p>

            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-3 text-xs text-stone-500 mb-4">
              {vendor.hostel && (
                <span className="flex items-center gap-1"><MapPin className="w-3 h-3 text-teal-500" />{vendor.hostel}</span>
              )}
              {respLabel && (
                <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-teal-500" />Responds in {respLabel}</span>
              )}
              {openTime && closeTime && (
                <span className="flex items-center gap-1"><Calendar className="w-3 h-3 text-teal-500" />{openTime} – {closeTime}</span>
              )}
            </div>

            {/* Rating */}
            {vendor.total_reviews > 0 && (
              <div className="mb-4">
                <StarBar rating={vendor.rating} total={vendor.total_reviews} />
              </div>
            )}

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: ShoppingCart, label: "Orders", value: vendor.completed_order_count || 0 },
                { icon: TrendingUp,   label: "Completion", value: `${Math.round(vendor.completion_rate || 0)}%` },
                { icon: Package,      label: "Listings", value: vendor.total_listings || listings.length },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="bg-stone-50 rounded-xl p-3 text-center">
                  <Icon className="w-4 h-4 text-teal-500 mx-auto mb-1" />
                  <p className="font-black text-stone-900 text-base">{value}</p>
                  <p className="text-stone-400 text-xs">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* ── BIO & HOURS ── */}
        {(vendor.bio || availableDays.length > 0) && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
            className="bg-white rounded-2xl p-5 shadow-sm border border-stone-100 space-y-4">
            {vendor.bio && (
              <div>
                <p className="text-teal-600 text-xs tracking-widest uppercase font-semibold mb-1.5">About</p>
                <p className="text-stone-600 text-sm leading-relaxed">{vendor.bio}</p>
              </div>
            )}
            {availableDays.length > 0 && (
              <div>
                <p className="text-teal-600 text-xs tracking-widest uppercase font-semibold mb-2">Available Days</p>
                <div className="flex flex-wrap gap-1.5">
                  {["mon","tue","wed","thu","fri","sat","sun"].map(day => (
                    <span key={day} className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                      availableDays.includes(day) ? "bg-teal-50 text-teal-700 border-teal-200" : "bg-stone-50 text-stone-300 border-stone-100"
                    }`}>
                      {DAY_LABELS[day]}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* ── LISTINGS ── */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-teal-600 text-xs tracking-widest uppercase font-semibold">
              {listings.length} Listing{listings.length !== 1 ? "s" : ""}
            </p>
          </div>
          {listings.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-stone-100">
              <Sparkles className="w-10 h-10 text-stone-200 mx-auto mb-3" />
              <p className="text-stone-400 text-sm">No listings yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {sortedListings.map((listing, i) => {
                const isService = (listing.listing_type || "").toLowerCase() === "service";
                const isOwn = !!(user?.id && user.id === listing.vendor?.id);
                const inCart = cart.some(ci => ci.id === listing.id);
                const discountPct = listing.discount_percent || 0;
                const effectivePrice = discountPct > 0
                  ? Math.round(Number(listing.price) * (1 - discountPct / 100))
                  : Number(listing.price);
                const wc = listing.weekly_order_count || 0;

                return (
                  <motion.div key={listing.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 + i * 0.03 }}
                    className="bg-white rounded-xl border border-stone-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow group">
                    <Link href={`/listing/${listing.id}`} className="block">
                      <div className="relative w-full aspect-square overflow-hidden bg-stone-50">
                        <SafeImage src={listing.image?.startsWith("http") ? listing.image : null} alt={listing.title} />
                        {!listing.is_available && (
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                            <span className="text-white font-bold bg-red-500 px-2 py-0.5 rounded-full text-xs">Unavailable</span>
                          </div>
                        )}
                        {discountPct > 0 && (
                          <div className="absolute top-2 left-2 bg-red-500 text-white px-1.5 py-0.5 rounded text-xs font-black">
                            -{discountPct}% OFF
                          </div>
                        )}
                        {wc >= 3 && listing.is_available && (
                          <div className="absolute bottom-2 left-2 flex items-center gap-0.5 bg-teal-600/90 text-white px-1.5 py-0.5 rounded text-xs font-semibold">
                            <Zap className="w-2.5 h-2.5" />{wc} this week
                          </div>
                        )}
                      </div>
                      <div className="p-3">
                        <p className="font-bold text-stone-900 text-sm line-clamp-1">{listing.title}</p>
                        {discountPct > 0 ? (
                          <div className="flex items-center gap-1 mt-1">
                            <p className="text-stone-400 text-xs line-through">₦{Number(listing.price).toLocaleString()}</p>
                            <p className="font-bold text-red-600 text-sm">₦{effectivePrice.toLocaleString()}</p>
                          </div>
                        ) : (
                          <p className="font-bold text-stone-900 text-sm mt-1">₦{Number(listing.price).toLocaleString()}</p>
                        )}
                        {listing.is_available && !isOwn && (
                          <button
                            onClick={e => {
                              e.preventDefault(); e.stopPropagation();
                              if (isService) { router.push(`/listing/${listing.id}`); return; }
                              addToCart({ id: listing.id, title: listing.title, price: effectivePrice, img: listing.image || "" });
                              showToast(inCart ? "Added again (+1)" : "Added to cart");
                            }}
                            className="mt-2 w-full py-1.5 rounded-lg text-white text-xs font-bold flex items-center justify-center gap-1"
                            style={{ background: "linear-gradient(135deg,#2DD4BF 0%,#0D9488 100%)" }}>
                            <ShoppingCart className="w-3 h-3" />
                            {isService ? "Book" : "Add to Cart"}
                          </button>
                        )}
                      </div>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>

        {/* ── REVIEWS ── */}
        {reviews.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="bg-white rounded-2xl p-5 shadow-sm border border-stone-100">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-teal-600 text-xs tracking-widest uppercase font-semibold">Reviews</p>
                {vendor.total_reviews > 0 && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-2xl font-black text-stone-900">{Number(vendor.rating).toFixed(1)}</span>
                    <div>
                      <div className="flex items-center gap-0.5">
                        {[1,2,3,4,5].map(n => (
                          <Star key={n} className={`w-3 h-3 ${n <= Math.round(vendor.rating) ? "fill-amber-400 text-amber-400" : "text-stone-200 fill-stone-200"}`} />
                        ))}
                      </div>
                      <p className="text-xs text-stone-400">{vendor.total_reviews} review{vendor.total_reviews !== 1 ? "s" : ""}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-4">
              {reviews.map((review: any) => (
                <div key={review.id} className="border-b border-stone-100 last:border-0 pb-4 last:pb-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-teal-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                        {(review.reviewer_username || "?").slice(0, 1).toUpperCase()}
                      </div>
                      <p className="text-sm font-semibold text-stone-800">@{review.reviewer_username}</p>
                    </div>
                    <div className="flex items-center gap-0.5">
                      {[1,2,3,4,5].map(n => (
                        <Star key={n} className={`w-3 h-3 ${n <= review.rating ? "fill-amber-400 text-amber-400" : "text-stone-200 fill-stone-200"}`} />
                      ))}
                    </div>
                  </div>
                  {review.comment && <p className="text-stone-600 text-sm leading-relaxed pl-9">{review.comment}</p>}
                  <p className="text-stone-300 text-xs mt-1 pl-9">
                    {new Date(review.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── ADMIN PANEL ── */}
        {isAdmin && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
            className="bg-purple-50 border border-purple-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-purple-600" />
              <p className="text-purple-700 text-xs tracking-[0.2em] uppercase font-semibold">Admin Controls</p>
            </div>
            <div className="text-xs text-stone-600 space-y-1">
              {vendor.email && <p><span className="font-medium text-stone-800">Email:</span> {vendor.email}</p>}
              {vendor.school && <p><span className="font-medium text-stone-800">School:</span> {vendor.school.toUpperCase()}</p>}
              {vendor.user_type && <p><span className="font-medium text-stone-800">Type:</span> {vendor.user_type}</p>}
              {vendor.is_active !== undefined && (
                <p><span className="font-medium text-stone-800">Account:</span>{" "}
                  <span className={vendor.is_active ? "text-teal-600" : "text-red-500"}>{vendor.is_active ? "Active" : "Deactivated"}</span>
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setNotifyOpen(true)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold bg-purple-100 text-purple-700 hover:bg-purple-200 transition-all">
                <BellRing className="w-4 h-4" /> Notify
              </button>
              <button onClick={handleRevokeVendor} disabled={!!adminLoading}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 ${confirmRevoke ? "bg-red-500 text-white" : "bg-red-100 text-red-700 hover:bg-red-200"}`}>
                <UserX className="w-4 h-4" />
                {adminLoading === "revoke" ? "Revoking..." : confirmRevoke ? "Confirm Revoke" : "Revoke Vendor"}
              </button>
            </div>
            {confirmRevoke && <p className="text-xs text-red-500 text-center">Tap &quot;Confirm Revoke&quot; to confirm</p>}
          </motion.div>
        )}

      </div>
    </div>
  );
}
