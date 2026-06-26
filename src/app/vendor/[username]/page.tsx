"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Star, Sparkles, MapPin, Shield, BellRing, UserX, X as XIcon,
  Clock, Share2, MessageCircle, Zap, ShoppingCart,
  Calendar, TrendingUp, Package, CheckCircle2,
} from "lucide-react";
import TopNav from "@/components/layout/TopNav";
import { SidebarLayout, Sidebar, SidebarCard } from "@/components/layout/Sidebar";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import { GRAD, SERIF } from "@/lib/tokens";
import { useAdminMode } from "@/hooks/useAdminMode";
import { useCart } from "@/lib/cartStore";
import { useAuth } from "@/lib/authStore";

/* ─── tiny helpers ─────────────────────────────────────────────────────── */

function SafeImg({ src, alt, className }: { src?: string | null; alt: string; className?: string }) {
  const [err, setErr] = useState(false);
  if (!src || err || !src.startsWith("http")) return (
    <div className={`w-full h-full bg-stone-100 flex items-center justify-center ${className ?? ""}`}>
      <Sparkles className="w-6 h-6 text-stone-300" />
    </div>
  );
  return <img src={src} alt={alt} loading="lazy" onError={() => setErr(true)} className={`w-full h-full object-cover ${className ?? ""}`} />;
}

const BADGE: Record<string, { label: string; emoji: string; cls: string }> = {
  top:     { label: "Top Vendor",     emoji: "🏆", cls: "bg-amber-500/20 text-amber-300 border border-amber-500/30" },
  trusted: { label: "Trusted Vendor", emoji: "✅", cls: "bg-teal-500/20  text-teal-300  border border-teal-500/30"  },
  rising:  { label: "Rising Star",    emoji: "⭐", cls: "bg-purple-500/20 text-purple-300 border border-purple-500/30" },
};

const DAYS = ["mon","tue","wed","thu","fri","sat","sun"];
const DAY  = { mon:"M", tue:"T", wed:"W", thu:"T", fri:"F", sat:"S", sun:"S" };

/* ─── page ─────────────────────────────────────────────────────────────── */

export default function VendorProfilePage() {
  const { username } = useParams() as { username: string };
  const router = useRouter();
  const { isAdmin }  = useAdminMode();
  const { user }     = useAuth();
  const { addToCart, cart } = useCart();

  const [vendor,   setVendor]   = useState<any>(null);
  const [listings, setListings] = useState<any[]>([]);
  const [reviews,  setReviews]  = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [toast,    setToast]    = useState("");
  const [adminLoading,  setAdminLoading]  = useState<string | null>(null);
  const [adminToast,    setAdminToast]    = useState("");
  const [notifyOpen,    setNotifyOpen]    = useState(false);
  const [notifyTitle,   setNotifyTitle]   = useState("");
  const [notifyMessage, setNotifyMessage] = useState("");
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const scrollKey = `vendor_scroll:${username}`;
  const flash = (m: string, admin = false) => {
    admin ? (setAdminToast(m), setTimeout(() => setAdminToast(""), 2400))
          : (setToast(m),      setTimeout(() => setToast(""),      2000));
  };

  useEffect(() => {
    (async () => {
      try {
        const [vRes, lRes] = await Promise.all([
          api.pub.vendor(username),
          api.pub.listings({ vendor_username: username, page_size: "100" }),
        ]);
        let v: any = null;
        if (vRes.ok) { v = await vRes.json(); setVendor(v); }
        if (lRes.ok) { const d = await lRes.json(); setListings(d.results || d || []); }
        if (v?.id) {
          const rRes = await api.pub.reviews({ vendor: String(v.id), page_size: "10" });
          if (rRes.ok) { const d = await rRes.json(); setReviews(d.results || d || []); }
        }
      } catch {}
      finally {
        setLoading(false);
        const y = sessionStorage.getItem(scrollKey);
        if (y) { sessionStorage.removeItem(scrollKey); requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, +y))); }
      }
    })();
    const track = (e: MouseEvent) => {
      if ((e.target as Element).closest("a")?.getAttribute("href")?.startsWith("/listing/"))
        sessionStorage.setItem(scrollKey, String(window.scrollY));
    };
    document.addEventListener("click", track, true);
    return () => document.removeEventListener("click", track, true);
  }, [username, scrollKey]);

  const handleShare = async () => {
    const url = `${location.origin}/vendor/${username}`;
    if (navigator.share) await navigator.share({ title: vendor?.business_name || username, url }).catch(() => {});
    else { await navigator.clipboard.writeText(url); flash("Link copied!"); }
  };

  const handleRevoke = async () => {
    if (!vendor?.id) return;
    if (!confirmRevoke) { setConfirmRevoke(true); return; }
    setAdminLoading("revoke");
    try {
      const res = await api.admin.updateUser(vendor.id, { user_type: "student" });
      if (!res.ok) throw new Error();
      flash("Vendor status revoked", true); setConfirmRevoke(false);
    } catch { flash("Failed", true); }
    finally { setAdminLoading(null); }
  };

  const handleNotify = async () => {
    if (!vendor?.id || !notifyTitle.trim() || !notifyMessage.trim()) return;
    setAdminLoading("notify");
    try {
      const res = await api.admin.notifyUser(vendor.id, { title: notifyTitle.trim(), message: notifyMessage.trim() });
      if (!res.ok) throw new Error();
      flash("Sent!", true); setNotifyOpen(false); setNotifyTitle(""); setNotifyMessage("");
    } catch { flash("Failed", true); }
    finally { setAdminLoading(null); }
  };

  /* ── loading skeleton ── */
  if (loading) return (
    <div className="min-h-screen bg-[#F0F0F0]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <TopNav showBack activeNav="vendors" />
      <div className="h-52 animate-pulse bg-zinc-800" />
      <div className="max-w-7xl mx-auto px-4 lg:px-8 py-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="bg-white rounded-2xl overflow-hidden animate-pulse">
            <div className="aspect-[3/4] bg-stone-100" />
            <div className="p-3 space-y-2"><div className="h-3 bg-stone-100 rounded" /><div className="h-3 bg-stone-100 rounded w-2/3" /></div>
          </div>
        ))}
      </div>
    </div>
  );

  if (!vendor) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-[#F0F0F0]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <TopNav showBack activeNav="vendors" />
      <Sparkles className="w-14 h-14 text-stone-300" />
      <p className="text-stone-400 font-semibold">Vendor not found</p>
    </div>
  );

  const badge = vendor.vendor_badge && vendor.vendor_badge !== "none" ? BADGE[vendor.vendor_badge] : null;
  const initials = (vendor.business_name || vendor.username || "??").slice(0, 2).toUpperCase();
  const respMins: number | null = vendor.avg_response_minutes ?? null;
  const respLabel = respMins === null ? null : respMins < 60 ? `~${respMins}m` : respMins < 1440 ? `~${Math.round(respMins / 60)}h` : `~${Math.round(respMins / 1440)}d`;
  const availDays: string[] = vendor.available_days || [];
  const sorted = [...listings.filter(l => l.is_available), ...listings.filter(l => !l.is_available)];

  /* ══════════════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════════════ */
  return (
    <div className="min-h-screen bg-[#F0F0F0]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <TopNav showBack activeNav="vendors" />

      {/* ── Toast ── */}
      <AnimatePresence>
        {(toast || adminToast) && (
          <motion.div key="toast" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="fixed top-16 left-1/2 -translate-x-1/2 z-[9999] px-5 py-2.5 rounded-full text-white text-sm font-semibold shadow-xl"
            style={{ background: GRAD }}>
            {toast || adminToast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Admin notify modal ── */}
      {notifyOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between mb-1">
              <p className="font-bold text-stone-900">Notify Vendor</p>
              <button onClick={() => setNotifyOpen(false)} className="p-1.5 rounded-full hover:bg-stone-100"><XIcon className="w-4 h-4" /></button>
            </div>
            <input value={notifyTitle} onChange={e => setNotifyTitle(e.target.value)} placeholder="Title"
              className="w-full px-4 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:border-teal-400" />
            <textarea value={notifyMessage} onChange={e => setNotifyMessage(e.target.value)} placeholder="Message" rows={3}
              className="w-full px-4 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:border-teal-400 resize-none" />
            <button onClick={handleNotify} disabled={!!adminLoading || !notifyTitle.trim() || !notifyMessage.trim()}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: GRAD }}>
              {adminLoading === "notify" ? "Sending…" : "Send Notification"}
            </button>
          </div>
        </div>
      )}

      {/* ══════════ HERO ══════════ */}
      <div className="relative overflow-hidden"
        style={{ background: "linear-gradient(135deg,#061512 0%,#0d1f1c 40%,#160a28 80%,#0f0818 100%)" }}>

        {/* dot-grid texture */}
        <div className="absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "28px 28px" }} />

        {/* subtle top accent line */}
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: GRAD }} />

        <div className="relative max-w-7xl mx-auto px-4 lg:px-8 pt-7 pb-6">
          <div className="flex items-start gap-5 lg:gap-7">

            {/* Avatar */}
            <div className="relative flex-shrink-0">
              <div className="w-[72px] h-[72px] lg:w-[88px] lg:h-[88px] rounded-2xl overflow-hidden shadow-lg"
                style={{ boxShadow: "0 0 0 3px rgba(255,255,255,0.12), 0 0 0 6px rgba(13,148,136,0.15)" }}>
                {vendor.profile_picture
                  ? <img src={vendor.profile_picture} alt={vendor.username} className="w-full h-full object-cover object-top" />
                  : <div className="w-full h-full flex items-center justify-center text-white font-black text-2xl" style={{ background: GRAD }}>{initials}</div>
                }
              </div>
              {vendor.is_online && (
                <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-400 rounded-full border-2 border-zinc-900 shadow" />
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-xl lg:text-2xl font-black text-white leading-tight" style={SERIF}>
                      {vendor.business_name || vendor.username}
                    </h1>
                    {badge && (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badge.cls}`}>
                        {badge.emoji} {badge.label}
                      </span>
                    )}
                  </div>
                  <p className="text-white/40 text-sm mt-0.5">@{vendor.username}</p>

                  {/* Rating */}
                  {vendor.total_reviews > 0 && (
                    <div className="flex items-center gap-1.5 mt-2">
                      <div className="flex gap-0.5">
                        {[1,2,3,4,5].map(n => (
                          <Star key={n} className={`w-3.5 h-3.5 ${n <= Math.round(vendor.rating) ? "fill-amber-400 text-amber-400" : "fill-white/10 text-white/10"}`} />
                        ))}
                      </div>
                      <span className="text-white font-bold text-sm">{Number(vendor.rating).toFixed(1)}</span>
                      <span className="text-white/30 text-xs">({vendor.total_reviews})</span>
                    </div>
                  )}

                  {/* Meta pills */}
                  <div className="flex flex-wrap gap-2 mt-3">
                    {vendor.hostel && (
                      <span className="flex items-center gap-1 text-xs text-white/60 bg-white/8 px-2.5 py-1 rounded-full">
                        <MapPin className="w-3 h-3 text-teal-400" />{vendor.hostel}
                      </span>
                    )}
                    {vendor.opening_time && vendor.closing_time && (
                      <span className="flex items-center gap-1 text-xs text-white/60 bg-white/8 px-2.5 py-1 rounded-full">
                        <Clock className="w-3 h-3 text-teal-400" />{vendor.opening_time}–{vendor.closing_time}
                      </span>
                    )}
                    {respLabel && (
                      <span className="flex items-center gap-1 text-xs text-white/60 bg-white/8 px-2.5 py-1 rounded-full">
                        <Zap className="w-3 h-3 text-teal-400" />{respLabel} reply
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={handleShare}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white text-sm font-semibold transition">
                    <Share2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Share</span>
                  </button>
                  <Link href={`/chat?vendor=${vendor.username}`}>
                    <button className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-sm font-semibold transition hover:opacity-90"
                      style={{ background: GRAD }}>
                      <MessageCircle className="w-3.5 h-3.5" />
                      Chat
                    </button>
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div className="mt-6 pt-5 border-t border-white/10 flex items-center gap-0">
            {[
              { value: vendor.completed_order_count || 0,             label: "Orders",     icon: ShoppingCart },
              { value: `${Math.round(vendor.completion_rate || 0)}%`, label: "Completion", icon: CheckCircle2 },
              { value: vendor.total_listings || listings.length,       label: "Listings",   icon: Package },
            ].map(({ value, label, icon: Icon }, i) => (
              <div key={label} className={`flex items-center gap-3 ${i > 0 ? "ml-6 pl-6 border-l border-white/10" : ""}`}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/8 flex-shrink-0">
                  <Icon className="w-4 h-4 text-teal-400" />
                </div>
                <div>
                  <p className="text-white font-black text-lg leading-none">{value}</p>
                  <p className="text-white/40 text-xs mt-0.5">{label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ══════════ BODY ══════════ */}
      <SidebarLayout
        sidebarWidth="220px"
        sidebar={
          <Sidebar>
            {vendor.bio && (
              <SidebarCard title="About">
                <p className="text-stone-600 text-sm leading-relaxed">{vendor.bio}</p>
              </SidebarCard>
            )}

            {availDays.length > 0 && (
              <SidebarCard title="Open days">
                <div className="flex gap-1.5">
                  {DAYS.map(d => (
                    <div key={d} className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition ${
                      availDays.includes(d) ? "text-white shadow-sm" : "bg-stone-100 text-stone-300"
                    }`} style={availDays.includes(d) ? { background: GRAD } : {}}>
                      {DAY[d as keyof typeof DAY]}
                    </div>
                  ))}
                </div>
              </SidebarCard>
            )}

            {reviews.length > 0 && (
              <SidebarCard>
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-2xl font-black text-stone-900">{Number(vendor.rating).toFixed(1)}</span>
                  <div>
                    <div className="flex gap-0.5">
                      {[1,2,3,4,5].map(n => (
                        <Star key={n} className={`w-3 h-3 ${n <= Math.round(vendor.rating) ? "fill-amber-400 text-amber-400" : "fill-stone-200 text-stone-200"}`} />
                      ))}
                    </div>
                    <p className="text-xs text-stone-400">{vendor.total_reviews} review{vendor.total_reviews !== 1 ? "s" : ""}</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {reviews.map((r: any) => (
                    <div key={r.id} className="pb-3 border-b border-stone-100 last:border-0 last:pb-0">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0"
                            style={{ background: GRAD }}>
                            {(r.reviewer_username || "?")[0].toUpperCase()}
                          </div>
                          <p className="text-xs font-semibold text-stone-700 truncate max-w-[100px]">@{r.reviewer_username}</p>
                        </div>
                        <div className="flex gap-0.5">
                          {[1,2,3,4,5].map(n => (
                            <Star key={n} className={`w-2.5 h-2.5 ${n <= r.rating ? "fill-amber-400 text-amber-400" : "fill-stone-200 text-stone-200"}`} />
                          ))}
                        </div>
                      </div>
                      {r.comment && <p className="text-xs text-stone-500 leading-relaxed pl-6.5 line-clamp-2">{r.comment}</p>}
                    </div>
                  ))}
                </div>
              </SidebarCard>
            )}

            {isAdmin && (
              <SidebarCard variant="admin">
                <div className="flex items-center gap-2 mb-3">
                  <Shield className="w-4 h-4 text-purple-600" />
                  <p className="text-purple-700 text-xs tracking-widest uppercase font-bold">Admin</p>
                </div>
                <div className="text-xs text-stone-600 space-y-1 mb-3">
                  {vendor.email     && <p><span className="font-semibold">Email:</span> {vendor.email}</p>}
                  {vendor.school    && <p><span className="font-semibold">School:</span> {vendor.school.toUpperCase()}</p>}
                  {vendor.user_type && <p><span className="font-semibold">Type:</span> {vendor.user_type}</p>}
                  {vendor.is_active !== undefined && (
                    <p><span className="font-semibold">Status:</span>{" "}
                      <span className={vendor.is_active ? "text-teal-600 font-semibold" : "text-red-500 font-semibold"}>
                        {vendor.is_active ? "Active" : "Deactivated"}
                      </span>
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setNotifyOpen(true)}
                    className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-bold bg-purple-100 text-purple-700 hover:bg-purple-200 transition">
                    <BellRing className="w-3 h-3" /> Notify
                  </button>
                  <button onClick={handleRevoke} disabled={!!adminLoading}
                    className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-bold transition disabled:opacity-50 ${confirmRevoke ? "bg-red-500 text-white" : "bg-red-100 text-red-700 hover:bg-red-200"}`}>
                    <UserX className="w-3 h-3" />
                    {adminLoading === "revoke" ? "…" : confirmRevoke ? "Confirm?" : "Revoke"}
                  </button>
                </div>
              </SidebarCard>
            )}
          </Sidebar>
        }>

        {/* ── PRODUCT GRID ── */}
        <div className="pb-28">
          {sorted.length === 0 ? (
            <div className="bg-white rounded-2xl p-16 text-center border border-stone-100 shadow-sm">
              <Sparkles className="w-10 h-10 text-stone-200 mx-auto mb-3" />
              <p className="text-stone-400 font-semibold text-sm">No listings yet</p>
            </div>
          ) : (
            <>
              <p className="text-xs font-bold text-stone-400 tracking-widest uppercase mb-4">
                {listings.length} listing{listings.length !== 1 ? "s" : ""}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 lg:gap-4">
                {sorted.map((listing, i) => {
                  const isService = (listing.listing_type || "").toLowerCase() === "service";
                  const isOwn     = !!(user?.id && user.id === listing.vendor?.id);
                  const inCart    = cart.some(c => c.id === listing.id);
                  const discount  = listing.discount_percent || 0;
                  const dealPrice = listing.deal?.discounted_price;
                  const effPrice  = dealPrice ? +dealPrice : discount > 0 ? Math.round(+listing.price * (1 - discount / 100)) : +listing.price;
                  const origPrice = (dealPrice || discount > 0) ? +listing.price : null;
                  const wc        = listing.weekly_order_count || 0;

                  return (
                    <motion.div key={listing.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i * 0.02, 0.18) }}
                      className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-lg border border-transparent hover:border-stone-200 transition-all duration-300">

                      <Link href={`/listing/${listing.id}`} className="block">
                        {/* Image */}
                        <div className="relative w-full aspect-[3/4] overflow-hidden bg-stone-50">
                          <SafeImg
                            src={listing.image?.startsWith("http") ? listing.image : null}
                            alt={listing.title}
                            className="group-hover:scale-[1.04] transition-transform duration-500"
                          />

                          {!listing.is_available && (
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                              <span className="text-white text-xs font-bold bg-black/70 px-3 py-1 rounded-full tracking-wide">Unavailable</span>
                            </div>
                          )}

                          {/* Discount badge */}
                          {(discount > 0 || dealPrice) && (
                            <div className="absolute top-2 left-2 bg-red-500 text-white text-[11px] font-black px-2 py-0.5 rounded-lg shadow">
                              -{discount || listing.deal?.discount_percent}%
                            </div>
                          )}

                          {/* Hot badge */}
                          {wc >= 3 && listing.is_available && (
                            <div className="absolute bottom-2 left-2 flex items-center gap-0.5 text-white text-[11px] font-semibold bg-black/55 backdrop-blur-sm px-2 py-0.5 rounded-lg">
                              <Zap className="w-2.5 h-2.5 text-yellow-400" /> {wc}/wk
                            </div>
                          )}

                          {/* Hover CTA overlay — desktop only */}
                          {listing.is_available && !isOwn && (
                            <div className="absolute inset-x-0 bottom-0 translate-y-full group-hover:translate-y-0 transition-transform duration-200 p-2 hidden sm:block">
                              <button
                                onClick={e => {
                                  e.preventDefault();
                                  if (isService) { router.push(`/listing/${listing.id}`); return; }
                                  addToCart({ id: listing.id, title: listing.title, price: effPrice, img: listing.image || "" });
                                  flash(inCart ? "Added again" : "Added to cart");
                                }}
                                className="w-full py-2 rounded-xl text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-lg"
                                style={{ background: isService ? "linear-gradient(135deg,#7C3AED,#4F46E5)" : GRAD }}>
                                {isService ? <><Calendar className="w-3 h-3" /> Book Now</> : <><ShoppingCart className="w-3 h-3" /> {inCart ? "In Cart ✓" : "Add to Cart"}</>}
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="px-3 pt-2.5 pb-1">
                          <p className="font-semibold text-stone-900 text-sm line-clamp-1 leading-snug">{listing.title}</p>
                          <div className="mt-1 flex items-center gap-1.5">
                            <span className="font-black text-stone-900 text-sm">₦{effPrice.toLocaleString()}</span>
                            {origPrice && <span className="text-stone-400 text-xs line-through">₦{origPrice.toLocaleString()}</span>}
                          </div>
                        </div>
                      </Link>

                      {/* Mobile CTA — always visible on small screens */}
                      {listing.is_available && !isOwn && (
                        <div className="px-3 pb-3 sm:hidden">
                          <button
                            onClick={() => {
                              if (isService) { router.push(`/listing/${listing.id}`); return; }
                              addToCart({ id: listing.id, title: listing.title, price: effPrice, img: listing.image || "" });
                              flash(inCart ? "Added again" : "Added to cart");
                            }}
                            className="w-full py-1.5 rounded-xl text-white text-xs font-bold flex items-center justify-center gap-1 transition-opacity hover:opacity-80"
                            style={{ background: isService ? "linear-gradient(135deg,#7C3AED,#4F46E5)" : GRAD }}>
                            {isService ? <><Calendar className="w-3 h-3" /> Book</> : <><ShoppingCart className="w-3 h-3" /> {inCart ? "In Cart" : "Add"}</>}
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

      </SidebarLayout>
    </div>
  );
}
