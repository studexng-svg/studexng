"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Star, Sparkles, MapPin, Shield, BellRing, UserX, X as XIcon,
  Clock, Share2, MessageCircle, Zap, ShoppingCart,
  CheckCircle, Calendar, TrendingUp, Package,
} from "lucide-react";
import TopNav from "@/components/layout/TopNav";
import Link from "next/link";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { GRAD, SERIF } from "@/lib/tokens";
import { useAdminMode } from "@/hooks/useAdminMode";
import { useCart } from "@/lib/cartStore";
import { useAuth } from "@/lib/authStore";

/* ─── helpers ──────────────────────────────────────────────────────────── */

function SafeImage({ src, alt, className }: { src?: string | null; alt: string; className?: string }) {
  const [err, setErr] = useState(false);
  if (!src || err || !src.startsWith("http")) {
    return (
      <div className={`w-full h-full bg-gradient-to-br from-teal-50 to-purple-50 flex items-center justify-center ${className ?? ""}`}>
        <Sparkles className="w-8 h-8 text-stone-200" />
      </div>
    );
  }
  return <img src={src} alt={alt} loading="lazy" className={`w-full h-full object-cover ${className ?? ""}`} onError={() => setErr(true)} />;
}

const BADGE_META: Record<string, { label: string; icon: string; bg: string; text: string }> = {
  top:     { label: "Top Vendor",     icon: "🏆", bg: "bg-amber-50",  text: "text-amber-700" },
  trusted: { label: "Trusted Vendor", icon: "✅", bg: "bg-teal-50",   text: "text-teal-700"  },
  rising:  { label: "Rising Vendor",  icon: "⭐", bg: "bg-purple-50", text: "text-purple-700" },
};

const DAY_ORDER = ["mon","tue","wed","thu","fri","sat","sun"];
const DAY_LABEL: Record<string, string> = { mon:"Mon", tue:"Tue", wed:"Wed", thu:"Thu", fri:"Fri", sat:"Sat", sun:"Sun" };

/* ─── main component ────────────────────────────────────────────────────── */

export default function VendorProfilePage() {
  const params   = useParams();
  const router   = useRouter();
  const username = params.username as string;
  const { isAdmin } = useAdminMode();
  const { user }    = useAuth();
  const { addToCart, cart } = useCart();

  const [vendor,   setVendor]   = useState<any>(null);
  const [listings, setListings] = useState<any[]>([]);
  const [reviews,  setReviews]  = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [toast,    setToast]    = useState("");

  const [adminLoading,     setAdminLoading]     = useState<string | null>(null);
  const [adminToast,       setAdminToast]       = useState("");
  const [notifyOpen,       setNotifyOpen]       = useState(false);
  const [notifyTitle,      setNotifyTitle]      = useState("");
  const [notifyMessage,    setNotifyMessage]    = useState("");
  const [confirmRevoke,    setConfirmRevoke]    = useState(false);

  const scrollKey = `vendor_scroll:${username}`;

  const showToast      = (m: string) => { setToast(m);      setTimeout(() => setToast(""),      2200); };
  const showAdminToast = (m: string) => { setAdminToast(m); setTimeout(() => setAdminToast(""), 2500); };

  useEffect(() => {
    (async () => {
      try {
        const [vRes, lRes] = await Promise.all([
          api.pub.vendor(username),
          api.pub.listings({ vendor_username: username, page_size: "100" }),
        ]);
        let v: any = null;
        if (vRes.ok)  { v = await vRes.json(); setVendor(v); }
        if (lRes.ok)  { const d = await lRes.json(); setListings(d.results || d || []); }
        if (v?.id) {
          const rRes = await api.pub.reviews({ vendor: String(v.id), page_size: "10" });
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
    })();

    const onClick = (e: MouseEvent) => {
      const href = (e.target as Element).closest("a")?.getAttribute("href") ?? "";
      if (href.startsWith("/listing/")) sessionStorage.setItem(scrollKey, String(window.scrollY));
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [username, scrollKey]);

  const handleShare = async () => {
    const url = `${window.location.origin}/vendor/${username}`;
    if (navigator.share) await navigator.share({ title: vendor?.business_name || username, url }).catch(() => {});
    else { await navigator.clipboard.writeText(url); showToast("Store link copied!"); }
  };

  const handleRevoke = async () => {
    if (!vendor?.id) return;
    if (!confirmRevoke) { setConfirmRevoke(true); return; }
    setAdminLoading("revoke");
    try {
      const res = await api.admin.updateUser(vendor.id, { user_type: "student" });
      if (!res.ok) throw new Error();
      showAdminToast("Vendor status revoked"); setConfirmRevoke(false);
    } catch { showAdminToast("Failed"); }
    finally { setAdminLoading(null); }
  };

  const handleNotify = async () => {
    if (!vendor?.id || !notifyTitle.trim() || !notifyMessage.trim()) return;
    setAdminLoading("notify");
    try {
      const res = await api.admin.notifyUser(vendor.id, { title: notifyTitle.trim(), message: notifyMessage.trim() });
      if (!res.ok) throw new Error();
      showAdminToast("Sent!"); setNotifyOpen(false); setNotifyTitle(""); setNotifyMessage("");
    } catch { showAdminToast("Failed"); }
    finally { setAdminLoading(null); }
  };

  /* ── loading ── */
  if (loading) return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <TopNav showBack activeNav="vendors" />
      <div className="h-56 bg-stone-200 animate-pulse" />
      <div className="max-w-7xl mx-auto px-4 lg:px-8 pt-6">
        <div className="lg:grid lg:grid-cols-[300px_1fr] lg:gap-10">
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-6 animate-pulse space-y-3">
              <div className="w-24 h-24 rounded-2xl bg-stone-100 mx-auto" />
              <div className="h-4 bg-stone-100 rounded w-3/4 mx-auto" />
              <div className="h-3 bg-stone-100 rounded w-1/2 mx-auto" />
            </div>
          </div>
          <div className="mt-6 lg:mt-0 grid grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl overflow-hidden animate-pulse">
                <div className="aspect-[3/4] bg-stone-100" />
                <div className="p-3 space-y-2"><div className="h-3 bg-stone-100 rounded" /><div className="h-3 bg-stone-100 rounded w-2/3" /></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  if (!vendor) return (
    <div className="min-h-screen bg-[#F5F5F5] flex flex-col items-center justify-center gap-3" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <TopNav showBack activeNav="vendors" />
      <Sparkles className="w-14 h-14 text-stone-200" />
      <p className="text-stone-400 font-semibold">Vendor not found</p>
    </div>
  );

  const badge = vendor.vendor_badge && vendor.vendor_badge !== "none" ? BADGE_META[vendor.vendor_badge] : null;
  const initials = (vendor.business_name || vendor.username || "??").slice(0, 2).toUpperCase();
  const respMins: number | null = vendor.avg_response_minutes ?? null;
  const respLabel = respMins === null ? null
    : respMins < 60   ? `~${respMins} min`
    : respMins < 1440 ? `~${Math.round(respMins / 60)} hr`
    : `~${Math.round(respMins / 1440)}d`;
  const availDays: string[] = vendor.available_days || [];

  const available   = listings.filter(l => l.is_available);
  const unavailable = listings.filter(l => !l.is_available);
  const sorted      = [...available, ...unavailable];

  /* ─────────────────── RENDER ─────────────────── */
  return (
    <div className="min-h-screen bg-[#F0F0F0]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <TopNav showBack activeNav="vendors" />

      {/* Toast */}
      {(toast || adminToast) && (
        <motion.div initial={{ y: -50, opacity: 0 }} animate={{ y: 64, opacity: 1 }}
          className="fixed top-0 left-1/2 -translate-x-1/2 z-[9999] px-6 py-3 rounded-full text-white text-sm font-semibold shadow-xl"
          style={{ background: GRAD }}>
          {toast || adminToast}
        </motion.div>
      )}

      {/* Admin notify modal */}
      {notifyOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between">
              <p className="font-bold text-stone-900">Notify Vendor</p>
              <button onClick={() => setNotifyOpen(false)} className="p-1.5 rounded-full hover:bg-stone-100"><XIcon className="w-4 h-4" /></button>
            </div>
            <input value={notifyTitle} onChange={e => setNotifyTitle(e.target.value)} placeholder="Title"
              className="w-full px-4 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:border-teal-400" />
            <textarea value={notifyMessage} onChange={e => setNotifyMessage(e.target.value)} placeholder="Message" rows={3}
              className="w-full px-4 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:border-teal-400 resize-none" />
            <button onClick={handleNotify} disabled={!!adminLoading || !notifyTitle.trim() || !notifyMessage.trim()}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition"
              style={{ background: GRAD }}>
              {adminLoading === "notify" ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      )}

      {/* ── COVER ── */}
      <div className="relative h-48 lg:h-64 overflow-hidden"
        style={{ background: "linear-gradient(135deg,#0f766e 0%,#0D9488 35%,#4F46E5 70%,#6D28D9 100%)" }}>
        {/* Subtle pattern */}
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: "radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
        {vendor.is_online && (
          <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-white/15 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/20">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-white text-xs font-semibold">Online now</span>
          </div>
        )}
      </div>

      {/* ── BODY ── */}
      <div className="max-w-7xl mx-auto px-4 lg:px-8">
        <div className="lg:grid lg:grid-cols-[300px_1fr] lg:gap-10 lg:items-start">

          {/* ══════════ LEFT SIDEBAR ══════════ */}
          <div className="lg:sticky lg:top-20">

            {/* Profile card */}
            <div className="bg-white rounded-2xl shadow-sm border border-stone-100 -mt-14 lg:-mt-20 relative z-10 overflow-hidden">
              {/* Avatar centered on top */}
              <div className="flex flex-col items-center pt-6 px-6 pb-5">
                <div className="w-24 h-24 lg:w-28 lg:h-28 rounded-2xl overflow-hidden shadow-lg border-4 border-white -mt-2 mb-4 flex-shrink-0">
                  {vendor.profile_picture
                    ? <img src={vendor.profile_picture} alt={vendor.username} className="w-full h-full object-cover object-top" />
                    : <div className="w-full h-full flex items-center justify-center text-white font-black text-2xl" style={{ background: GRAD }}>{initials}</div>
                  }
                </div>

                <h1 className="text-lg font-black text-stone-900 text-center leading-tight mb-0.5" style={SERIF}>
                  {vendor.business_name || vendor.username}
                </h1>
                <p className="text-stone-400 text-sm mb-2">@{vendor.username}</p>

                {badge && (
                  <span className={`text-xs font-bold px-3 py-1 rounded-full mb-3 ${badge.bg} ${badge.text}`}>
                    {badge.icon} {badge.label}
                  </span>
                )}

                {/* Rating */}
                {vendor.total_reviews > 0 && (
                  <div className="flex items-center gap-1.5 mb-3">
                    <div className="flex gap-0.5">
                      {[1,2,3,4,5].map(n => (
                        <Star key={n} className={`w-3.5 h-3.5 ${n <= Math.round(vendor.rating) ? "fill-amber-400 text-amber-400" : "fill-stone-200 text-stone-200"}`} />
                      ))}
                    </div>
                    <span className="font-bold text-stone-900 text-sm">{Number(vendor.rating).toFixed(1)}</span>
                    <span className="text-stone-400 text-xs">({vendor.total_reviews})</span>
                  </div>
                )}

                {/* Meta */}
                <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-stone-500 mb-4">
                  {vendor.hostel && <span className="flex items-center gap-1"><MapPin className="w-3 h-3 text-teal-500" />{vendor.hostel}</span>}
                  {respLabel && <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-teal-500" />{respLabel}</span>}
                  {vendor.opening_time && vendor.closing_time && (
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3 text-teal-500" />{vendor.opening_time} – {vendor.closing_time}</span>
                  )}
                </div>

                {/* CTA buttons */}
                <div className="flex gap-2 w-full">
                  <button onClick={handleShare}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 transition text-stone-700 text-xs font-bold">
                    <Share2 className="w-3.5 h-3.5" /> Share
                  </button>
                  <Link href={`/chat?vendor=${vendor.username}`} className="flex-1">
                    <button className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-white text-xs font-bold transition hover:opacity-90"
                      style={{ background: GRAD }}>
                      <MessageCircle className="w-3.5 h-3.5" /> Chat
                    </button>
                  </Link>
                </div>
              </div>

              {/* Stats strip */}
              <div className="grid grid-cols-3 border-t border-stone-100">
                {[
                  { icon: ShoppingCart, label: "Orders",     value: vendor.completed_order_count || 0 },
                  { icon: TrendingUp,   label: "Completion", value: `${Math.round(vendor.completion_rate || 0)}%` },
                  { icon: Package,      label: "Listings",   value: vendor.total_listings || listings.length },
                ].map(({ icon: Icon, label, value }, i) => (
                  <div key={label} className={`flex flex-col items-center py-4 gap-1 ${i < 2 ? "border-r border-stone-100" : ""}`}>
                    <Icon className="w-4 h-4 text-teal-500" />
                    <p className="font-black text-stone-900 text-lg leading-none">{value}</p>
                    <p className="text-stone-400 text-xs">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Bio + Hours */}
            {(vendor.bio || availDays.length > 0) && (
              <div className="mt-3 bg-white rounded-2xl shadow-sm border border-stone-100 p-5 space-y-4">
                {vendor.bio && (
                  <div>
                    <p className="text-xs font-bold text-teal-600 tracking-widest uppercase mb-1.5">About</p>
                    <p className="text-stone-600 text-sm leading-relaxed">{vendor.bio}</p>
                  </div>
                )}
                {availDays.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-teal-600 tracking-widest uppercase mb-2">Available</p>
                    <div className="flex flex-wrap gap-1">
                      {DAY_ORDER.map(d => (
                        <span key={d} className={`text-xs font-semibold px-2 py-0.5 rounded-md ${
                          availDays.includes(d) ? "bg-teal-600 text-white" : "bg-stone-100 text-stone-300"
                        }`}>{DAY_LABEL[d]}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Reviews — shown in sidebar on desktop */}
            {reviews.length > 0 && (
              <div className="mt-3 bg-white rounded-2xl shadow-sm border border-stone-100 p-5">
                <div className="flex items-baseline gap-2 mb-4">
                  <span className="text-3xl font-black text-stone-900">{Number(vendor.rating).toFixed(1)}</span>
                  <div>
                    <div className="flex gap-0.5">
                      {[1,2,3,4,5].map(n => (
                        <Star key={n} className={`w-3 h-3 ${n <= Math.round(vendor.rating) ? "fill-amber-400 text-amber-400" : "fill-stone-200 text-stone-200"}`} />
                      ))}
                    </div>
                    <p className="text-xs text-stone-400 mt-0.5">{vendor.total_reviews} review{vendor.total_reviews !== 1 ? "s" : ""}</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {reviews.map((r: any) => (
                    <div key={r.id} className="pb-3 border-b border-stone-100 last:border-0 last:pb-0">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center flex-shrink-0"
                            style={{ background: GRAD }}>
                            {(r.reviewer_username || "?").slice(0, 1).toUpperCase()}
                          </div>
                          <p className="text-xs font-semibold text-stone-700">@{r.reviewer_username}</p>
                        </div>
                        <div className="flex gap-0.5">
                          {[1,2,3,4,5].map(n => (
                            <Star key={n} className={`w-2.5 h-2.5 ${n <= r.rating ? "fill-amber-400 text-amber-400" : "fill-stone-200 text-stone-200"}`} />
                          ))}
                        </div>
                      </div>
                      {r.comment && <p className="text-xs text-stone-500 leading-relaxed pl-8 line-clamp-2">{r.comment}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Admin panel */}
            {isAdmin && (
              <div className="mt-3 bg-purple-50 border border-purple-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-purple-600" />
                  <p className="text-purple-700 text-xs tracking-widest uppercase font-semibold">Admin</p>
                </div>
                <div className="text-xs text-stone-600 space-y-1">
                  {vendor.email      && <p><span className="font-medium">Email:</span> {vendor.email}</p>}
                  {vendor.school     && <p><span className="font-medium">School:</span> {vendor.school.toUpperCase()}</p>}
                  {vendor.user_type  && <p><span className="font-medium">Type:</span> {vendor.user_type}</p>}
                  {vendor.is_active !== undefined && (
                    <p><span className="font-medium">Status:</span>{" "}
                      <span className={vendor.is_active ? "text-teal-600" : "text-red-500"}>{vendor.is_active ? "Active" : "Deactivated"}</span>
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setNotifyOpen(true)}
                    className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-sm font-semibold bg-purple-100 text-purple-700 hover:bg-purple-200 transition">
                    <BellRing className="w-3.5 h-3.5" /> Notify
                  </button>
                  <button onClick={handleRevoke} disabled={!!adminLoading}
                    className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-sm font-semibold transition disabled:opacity-50 ${confirmRevoke ? "bg-red-500 text-white" : "bg-red-100 text-red-700 hover:bg-red-200"}`}>
                    <UserX className="w-3.5 h-3.5" />
                    {adminLoading === "revoke" ? "…" : confirmRevoke ? "Confirm" : "Revoke"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ══════════ RIGHT — PRODUCT GRID ══════════ */}
          <div className="mt-4 lg:mt-6 pb-28">

            {listings.length === 0 ? (
              <div className="bg-white rounded-2xl p-20 text-center border border-stone-100 shadow-sm">
                <Sparkles className="w-12 h-12 text-stone-200 mx-auto mb-3" />
                <p className="text-stone-400 font-semibold">No listings yet</p>
                <p className="text-stone-300 text-sm mt-1">Check back soon</p>
              </div>
            ) : (
              <>
                <p className="text-xs font-bold text-stone-400 tracking-widest uppercase mb-4">
                  {listings.length} listing{listings.length !== 1 ? "s" : ""}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3 lg:gap-4">
                  {sorted.map((listing, i) => {
                    const isService = (listing.listing_type || "").toLowerCase() === "service";
                    const isOwn     = !!(user?.id && user.id === listing.vendor?.id);
                    const inCart    = cart.some(c => c.id === listing.id);
                    const discount  = listing.discount_percent || 0;
                    const dealPrice = listing.deal?.discounted_price;
                    const effectivePrice = dealPrice
                      ? Number(dealPrice)
                      : discount > 0
                        ? Math.round(Number(listing.price) * (1 - discount / 100))
                        : Number(listing.price);
                    const originalPrice = (dealPrice || discount > 0) ? Number(listing.price) : null;
                    const wc = listing.weekly_order_count || 0;

                    return (
                      <motion.div key={listing.id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(i * 0.03, 0.25) }}
                        className="group bg-white rounded-2xl overflow-hidden border border-stone-100 hover:border-stone-200 shadow-sm hover:shadow-lg transition-all duration-300">

                        <Link href={`/listing/${listing.id}`} className="block">
                          {/* Image — taller aspect ratio */}
                          <div className="relative w-full aspect-[3/4] overflow-hidden bg-stone-50">
                            <SafeImage
                              src={listing.image?.startsWith("http") ? listing.image : null}
                              alt={listing.title}
                              className="group-hover:scale-105 transition-transform duration-500"
                            />

                            {/* Unavailable overlay */}
                            {!listing.is_available && (
                              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                <span className="text-white text-xs font-bold bg-black/60 px-3 py-1 rounded-full">Unavailable</span>
                              </div>
                            )}

                            {/* Discount badge */}
                            {(discount > 0 || dealPrice) && (
                              <div className="absolute top-2.5 left-2.5 bg-red-500 text-white px-2 py-0.5 rounded-lg text-xs font-black shadow">
                                -{discount || listing.deal?.discount_percent}% OFF
                              </div>
                            )}

                            {/* Activity badge */}
                            {wc >= 3 && listing.is_available && (
                              <div className="absolute bottom-2.5 left-2.5 flex items-center gap-0.5 bg-teal-600/90 backdrop-blur-sm text-white px-2 py-0.5 rounded-lg text-xs font-semibold">
                                <Zap className="w-2.5 h-2.5" /> {wc} this week
                              </div>
                            )}
                          </div>

                          {/* Info */}
                          <div className="p-3">
                            <p className="font-bold text-stone-900 text-sm line-clamp-2 leading-snug">{listing.title}</p>

                            <div className="mt-2 flex items-center justify-between">
                              <div>
                                {originalPrice ? (
                                  <div className="flex items-baseline gap-1.5">
                                    <span className="text-stone-400 text-xs line-through">₦{originalPrice.toLocaleString()}</span>
                                    <span className="font-black text-red-600 text-sm">₦{effectivePrice.toLocaleString()}</span>
                                  </div>
                                ) : (
                                  <span className="font-black text-stone-900 text-sm">₦{effectivePrice.toLocaleString()}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </Link>

                        {/* Add to cart / Book — below the link */}
                        {listing.is_available && !isOwn && (
                          <div className="px-3 pb-3">
                            <button
                              onClick={() => {
                                if (isService) { router.push(`/listing/${listing.id}`); return; }
                                addToCart({ id: listing.id, title: listing.title, price: effectivePrice, img: listing.image || "" });
                                showToast(inCart ? "Added again (+1)" : "Added to cart");
                              }}
                              className="w-full py-2 rounded-xl text-white text-xs font-bold flex items-center justify-center gap-1.5 transition hover:opacity-90"
                              style={{ background: isService
                                ? "linear-gradient(135deg,#6D28D9 0%,#4F46E5 100%)"
                                : "linear-gradient(135deg,#2DD4BF 0%,#0D9488 100%)" }}>
                              {isService ? <><Calendar className="w-3 h-3" /> Book Now</> : <><ShoppingCart className="w-3 h-3" /> {inCart ? "In Cart" : "Add to Cart"}</>}
                            </button>
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
