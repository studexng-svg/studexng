"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Star, Sparkles, MapPin, Shield, BellRing, UserX, X as XIcon,
  Clock, Share2, MessageCircle, Zap, ShoppingCart,
  Calendar, Package, CheckCircle2,
} from "lucide-react";
import TopNav from "@/components/layout/TopNav";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import { GRAD, TEAL, PURPLE } from "@/lib/tokens";
import { useAdminMode } from "@/hooks/useAdminMode";
import { useCart } from "@/lib/cartStore";
import { useAuth } from "@/lib/authStore";
import AddonPickerModal, { AddonGroupData } from "@/components/cart/AddonPickerModal";
import RestaurantMenuView, { MenuOrderingItem } from "./RestaurantMenuView";

/* ── helpers ───────────────────────────────────────────────────────────── */

function SafeImg({ src, alt, className }: { src?: string | null; alt: string; className?: string }) {
  const [err, setErr] = useState(false);
  if (!src || err || !src.startsWith("http")) return (
    <div className={`w-full h-full bg-stone-100 flex items-center justify-center ${className ?? ""}`}>
      <Sparkles className="w-6 h-6 text-stone-300" />
    </div>
  );
  return <img src={src} alt={alt} loading="lazy" onError={() => setErr(true)} className={`w-full h-full object-cover ${className ?? ""}`} />;
}

const BADGE_MAP: Record<string, { label: string; emoji: string }> = {
  top:     { label: "Top Vendor",     emoji: "🏆" },
  trusted: { label: "Trusted Vendor", emoji: "✅" },
  rising:  { label: "Rising Star",    emoji: "⭐" },
};

const DAYS    = ["mon","tue","wed","thu","fri","sat","sun"] as const;
const DAY_LBL = { mon:"M", tue:"T", wed:"W", thu:"T", fri:"F", sat:"S", sun:"S" } as const;

type Tab = "listings" | "reviews" | "about";

/* ── page ───────────────────────────────────────────────────────────────── */

export default function VendorProfilePage() {
  const { username }   = useParams() as { username: string };
  const router         = useRouter();
  const { isAdmin }    = useAdminMode();
  const { user }       = useAuth();
  const { addToCart, cart } = useCart();

  const [vendor,   setVendor]   = useState<any>(null);
  const [listings, setListings] = useState<any[]>([]);
  const [reviews,  setReviews]  = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [tab,      setTab]      = useState<Tab>("listings");

  const [addonPicker, setAddonPicker] = useState<{ listing: { id: number; title: string; price: number; image?: string | null; description?: string }; groups: AddonGroupData[] } | null>(null);
  const [toast,        setToast]        = useState("");
  const [adminToast,   setAdminToast]   = useState("");
  const [adminLoading, setAdminLoading] = useState<string | null>(null);
  const [notifyOpen,    setNotifyOpen]    = useState(false);
  const [notifyTitle,   setNotifyTitle]   = useState("");
  const [notifyMessage, setNotifyMessage] = useState("");
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const scrollKey = `vendor_scroll:${username}`;
  const flash = (m: string, admin = false) => {
    admin
      ? (setAdminToast(m), setTimeout(() => setAdminToast(""), 2400))
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
          const rRes = await api.pub.reviews({ vendor: String(v.id), page_size: "20" });
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

  /* ── loading ── */
  if (loading) return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <TopNav showBack activeNav="vendors" />
      <div className="max-w-6xl mx-auto px-6 lg:px-8 pt-10">
        <div className="flex gap-8 mb-10">
          <div className="w-48 h-48 rounded-3xl bg-stone-100 animate-pulse flex-shrink-0" />
          <div className="flex-1 space-y-3 pt-2">
            <div className="h-8 bg-stone-100 rounded-xl w-56 animate-pulse" />
            <div className="h-4 bg-stone-100 rounded-lg w-32 animate-pulse" />
            <div className="h-4 bg-stone-100 rounded-lg w-72 animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="rounded-2xl overflow-hidden animate-pulse border border-stone-100">
              <div className="aspect-[3/4] bg-stone-100" />
              <div className="p-3 space-y-2"><div className="h-3 bg-stone-100 rounded" /><div className="h-3 bg-stone-100 rounded w-2/3" /></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  if (!vendor) return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-3" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <TopNav showBack activeNav="vendors" />
      <Sparkles className="w-14 h-14 text-stone-300" />
      <p className="text-stone-400 font-semibold">Vendor not found</p>
    </div>
  );

  const badge        = vendor.vendor_badge && vendor.vendor_badge !== "none" ? BADGE_MAP[vendor.vendor_badge] : null;
  const initials     = (vendor.business_name || vendor.username || "??").slice(0, 2).toUpperCase();
  const respMins     = vendor.avg_response_minutes ?? null;
  const respLabel    = respMins === null ? null : respMins < 60 ? `~${respMins}m` : respMins < 1440 ? `~${Math.round(respMins / 60)}h` : `~${Math.round(respMins / 1440)}d`;
  const availDays: string[] = vendor.available_days || [];
  const sorted       = [...listings.filter(l => l.is_available), ...listings.filter(l => !l.is_available)];
  const vendorRating = Number(vendor.rating) || 0;
  const totalReviews = Number(vendor.total_reviews) || 0;
  const ratingCounts = [5,4,3,2,1].map(n => ({ n, count: reviews.filter((r:any) => r.rating === n).length }));

  const DAY_FULL = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];
  const isDayOpen = (d: typeof DAYS[number]) => {
    if (!availDays.length) return false;
    const idx = DAYS.indexOf(d);
    return availDays.some((ad: string) => {
      const v = String(ad).toLowerCase().trim();
      return v === d || v === DAY_FULL[idx] || v.startsWith(d) || v === String(idx) || v === String(idx + 1);
    });
  };

  // A menu-ordering vendor (food, etc.) gets the restaurant-style browsing
  // experience instead of the marketplace grid — detected from the data
  // itself (any listing with a non-null menu_item) rather than a new field,
  // since ListingSerializer already exposes menu_item on every listing.
  const isMenuVendor = listings.some((l: any) => l.menu_item);

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: "listings", label: isMenuVendor ? "Menu" : "Listings", count: sorted.length },
    { id: "reviews",  label: "Reviews",  count: totalReviews  },
    { id: "about",    label: "About"                          },
  ];

  /* ══════════════════════════════════════════════════════════════════════ */
  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <TopNav showBack activeNav="vendors" />

      {/* ── Toast ── */}
      <AnimatePresence>
        {(toast || adminToast) && (
          <motion.div key="toast" initial={{ opacity:0, y:-20 }} animate={{ opacity:1, y:72 }} exit={{ opacity:0 }}
            className="fixed top-0 left-1/2 -translate-x-1/2 z-[9999] px-5 py-2.5 rounded-full text-white text-sm font-semibold shadow-xl"
            style={{ background: TEAL }}>
            {toast || adminToast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Add-on picker modal (menu items with customization) ── */}
      {addonPicker && (
        <AddonPickerModal
          listing={addonPicker.listing}
          addonGroups={addonPicker.groups}
          onClose={() => setAddonPicker(null)}
          onAdded={() => flash("Added to cart")}
        />
      )}

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
              className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: TEAL }}>
              {adminLoading === "notify" ? "Sending…" : "Send Notification"}
            </button>
          </div>
        </div>
      )}

      {/* ══════════ HERO ══════════ */}
      <div className="relative overflow-hidden border-b border-stone-100">
        {/* Teal gradient blob */}
        <div className="absolute inset-0 pointer-events-none">
          <div style={{
            position: "absolute", top: "-30%", left: "-10%",
            width: "55%", height: "200%",
            background: "radial-gradient(ellipse, rgba(13,148,136,0.07) 0%, transparent 65%)",
            borderRadius: "50%",
          }} />
          <div style={{
            position: "absolute", top: "-20%", right: "5%",
            width: "35%", height: "140%",
            background: "radial-gradient(ellipse, rgba(13,148,136,0.04) 0%, transparent 60%)",
            borderRadius: "50%",
          }} />
        </div>

        <div className="relative max-w-6xl mx-auto px-6 lg:px-8 py-10 lg:py-14">
          <div className="flex flex-col lg:flex-row items-start gap-8 lg:gap-12">

            {/* ── Large avatar ── */}
            <div className="relative flex-shrink-0">
              <div className="w-36 h-36 lg:w-52 lg:h-52 rounded-3xl overflow-hidden shadow-xl ring-4 ring-white">
                {vendor.profile_picture
                  ? <img src={vendor.profile_picture} alt={vendor.username} className="w-full h-full object-cover object-top" />
                  : <div className="w-full h-full flex items-center justify-center text-white font-black text-4xl" style={{ background: TEAL }}>{initials}</div>
                }
              </div>
              {vendor.is_online && (
                <span className="absolute bottom-2 right-2 w-5 h-5 bg-green-400 rounded-full border-[3px] border-white shadow-md" />
              )}
            </div>

            {/* ── Info + stats ── */}
            <div className="flex-1 min-w-0 flex flex-col lg:flex-row items-start gap-8 lg:gap-12 justify-between">

              {/* Name / bio / actions */}
              <div className="min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-3xl lg:text-4xl font-black text-stone-900 [overflow-wrap:anywhere] leading-tight" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                    {vendor.business_name || vendor.username}
                  </h1>
                  {badge && (
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-teal-50 text-teal-700 border border-teal-200 flex-shrink-0">
                      {badge.emoji} {badge.label}
                    </span>
                  )}
                </div>
                <p className="text-stone-400 text-sm mt-1.5">@{vendor.username}</p>

                {vendor.bio && (
                  <p className="text-stone-600 mt-3 text-sm leading-relaxed max-w-sm">{vendor.bio}</p>
                )}

                <div className="flex flex-wrap gap-2 mt-3">
                  {vendor.hostel && (
                    <span className="flex items-center gap-1 text-xs text-stone-500 bg-stone-100 px-2.5 py-1 rounded-full">
                      <MapPin className="w-3 h-3 text-teal-500" />{vendor.hostel}
                    </span>
                  )}
                  {respLabel && (
                    <span className="flex items-center gap-1 text-xs text-stone-500 bg-stone-100 px-2.5 py-1 rounded-full">
                      <Zap className="w-3 h-3 text-teal-500" />{respLabel} reply
                    </span>
                  )}
                  {totalReviews > 0 && (
                    <span className="flex items-center gap-1 text-xs text-stone-500 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-100">
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                      {vendorRating.toFixed(1)} · {totalReviews} review{totalReviews !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 mt-6">
                  <button onClick={handleShare}
                    className="px-5 py-2.5 rounded-2xl border border-stone-200 bg-white text-stone-800 text-sm font-semibold hover:bg-stone-50 active:scale-95 transition-all flex items-center gap-1.5 shadow-sm">
                    <Share2 className="w-4 h-4" /> Share
                  </button>
                  <Link href={`/chat?vendor=${vendor.username}`}>
                    <button className="px-5 py-2.5 rounded-2xl text-white text-sm font-semibold hover:opacity-90 active:scale-95 transition-all flex items-center gap-1.5 shadow-md"
                      style={{ background: "#0d9488" }}>
                      <MessageCircle className="w-4 h-4" /> Chat
                    </button>
                  </Link>
                </div>
              </div>

              {/* Stats block */}
              <div className="flex gap-8 lg:gap-12 flex-shrink-0 lg:pt-2">
                {[
                  { value: vendor.completed_order_count || 0,             label: "Orders"     },
                  { value: `${Math.round(vendor.completion_rate || 0)}%`, label: "Completion" },
                  { value: vendor.total_listings || listings.length,       label: "Listings"   },
                ].map(({ value, label }) => (
                  <div key={label} className="text-center">
                    <p className="text-xs text-stone-400 font-semibold tracking-wide uppercase">{label}</p>
                    <p className="text-3xl lg:text-4xl font-black text-stone-900 mt-1 leading-none">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════ TAB BAR ══════════ */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-stone-100">
        <div className="max-w-6xl mx-auto px-6 lg:px-8">
          <div className="flex gap-1">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`relative px-4 py-4 text-sm font-semibold transition-colors ${
                  tab === t.id ? "text-stone-900" : "text-stone-400 hover:text-stone-600"
                }`}>
                {t.label}{t.count !== undefined ? ` ${t.count}` : ""}
                {tab === t.id && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-500 rounded-t-full" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ══════════ TAB CONTENT ══════════ */}
      <div className="max-w-6xl mx-auto px-6 lg:px-8 pt-8 pb-28">

        {/* ── Listings tab ── */}
        {tab === "listings" && isMenuVendor && (
          <RestaurantMenuView
            listings={sorted as MenuOrderingItem[]}
            isOwn={!!(user?.id && user.id === vendor.id)}
            onSelectItem={(item) => setAddonPicker({
              listing: { id: item.id, title: item.title, price: Number(item.price), image: item.image, description: item.description },
              groups: item.menu_item?.addon_groups || [],
            })}
          />
        )}

        {/* ── Listings tab (marketplace grid — non menu-ordering vendors) ── */}
        {tab === "listings" && !isMenuVendor && (
          <>
            {sorted.length === 0 ? (
              <div className="bg-stone-50 rounded-2xl p-16 text-center border border-stone-100">
                <Sparkles className="w-10 h-10 text-stone-200 mx-auto mb-3" />
                <p className="text-stone-400 font-semibold text-sm">No listings yet</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 lg:gap-4">
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
                      initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }}
                      transition={{ delay: Math.min(i * 0.02, 0.18) }}
                      className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md border border-stone-100 hover:border-stone-200 transition-all duration-300">

                      <Link href={`/listing/${listing.id}`} className="block">
                        <div className="relative w-full aspect-[3/4] overflow-hidden bg-stone-50">
                          <SafeImg src={listing.image?.startsWith("http") ? listing.image : null} alt={listing.title}
                            className="group-hover:scale-[1.04] transition-transform duration-500" />
                          {!listing.is_available && (
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                              <span className="text-white text-xs font-bold bg-black/70 px-3 py-1 rounded-full tracking-wide">Unavailable</span>
                            </div>
                          )}
                          {(discount > 0 || dealPrice) && (
                            <div className="absolute top-2 left-2 bg-red-500 text-white text-[11px] font-black px-2 py-0.5 rounded-lg shadow">
                              -{discount || listing.deal?.discount_percent}%
                            </div>
                          )}
                          {wc >= 3 && listing.is_available && (
                            <div className="absolute bottom-2 left-2 flex items-center gap-0.5 text-white text-[11px] font-semibold bg-black/55 backdrop-blur-sm px-2 py-0.5 rounded-lg">
                              <Zap className="w-2.5 h-2.5 text-yellow-400" /> {wc}/wk
                            </div>
                          )}
                          {listing.is_available && !isOwn && (
                            <div className="absolute inset-x-0 bottom-0 translate-y-full group-hover:translate-y-0 transition-transform duration-200 p-2 hidden sm:block">
                              <button onClick={e => {
                                  e.preventDefault();
                                  if (isService) { router.push(`/listing/${listing.id}`); return; }
                                  const groups: AddonGroupData[] = listing.menu_item?.addon_groups || [];
                                  if (groups.length > 0) {
                                    setAddonPicker({ listing: { id: listing.id, title: listing.title, price: effPrice }, groups });
                                    return;
                                  }
                                  addToCart({ id: listing.id, title: listing.title, price: effPrice, img: listing.image || "" });
                                  flash(inCart ? "Added again" : "Added to cart");
                                }}
                                className="w-full py-2 rounded-xl text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-lg"
                                style={{ background: "#0d9488" }}>
                                {isService ? <><Calendar className="w-3 h-3" /> Book Now</> : <><ShoppingCart className="w-3 h-3" /> {inCart ? "In Cart ✓" : "Add to Cart"}</>}
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="px-3 pt-2.5 pb-1">
                          <p className="font-semibold text-stone-900 text-sm line-clamp-1 leading-snug">{listing.title}</p>
                          <div className="mt-1 flex items-center gap-1.5">
                            <span className="font-black text-stone-900 text-sm">₦{effPrice.toLocaleString()}</span>
                            {origPrice && <span className="text-stone-400 text-xs line-through">₦{origPrice.toLocaleString()}</span>}
                          </div>
                        </div>
                      </Link>

                      {listing.is_available && !isOwn && (
                        <div className="px-3 pb-3 sm:hidden">
                          <button onClick={() => {
                              if (isService) { router.push(`/listing/${listing.id}`); return; }
                              const groups: AddonGroupData[] = listing.menu_item?.addon_groups || [];
                              if (groups.length > 0) {
                                setAddonPicker({ listing: { id: listing.id, title: listing.title, price: effPrice }, groups });
                                return;
                              }
                              addToCart({ id: listing.id, title: listing.title, price: effPrice, img: listing.image || "" });
                              flash(inCart ? "Added again" : "Added to cart");
                            }}
                            className="w-full py-1.5 rounded-xl text-white text-xs font-bold flex items-center justify-center gap-1 hover:opacity-80 transition"
                            style={{ background: "#0d9488" }}>
                            {isService ? <><Calendar className="w-3 h-3" /> Book</> : <><ShoppingCart className="w-3 h-3" /> {inCart ? "In Cart" : "Add"}</>}
                          </button>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── Reviews tab ── */}
        {tab === "reviews" && (
          <>
            {reviews.length === 0 ? (
              <div className="bg-stone-50 rounded-2xl p-16 text-center border border-stone-100">
                <Star className="w-10 h-10 text-stone-200 mx-auto mb-3" />
                <p className="text-stone-400 font-semibold text-sm">No reviews yet</p>
              </div>
            ) : (
              <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.2 }}>
                {/* Rating summary */}
                <div className="flex flex-col sm:flex-row items-start gap-8 mb-8 p-6 bg-stone-50 rounded-2xl border border-stone-100">
                  <div className="flex-shrink-0 text-center">
                    <p className="text-6xl font-black text-stone-900 leading-none">{vendorRating.toFixed(1)}</p>
                    <div className="flex gap-0.5 justify-center mt-2">
                      {[1,2,3,4,5].map(n => <Star key={n} className={`w-4 h-4 ${n<=Math.round(vendorRating)?"fill-amber-400 text-amber-400":"fill-stone-200 text-stone-200"}`} />)}
                    </div>
                    <p className="text-xs text-stone-400 mt-1.5">{totalReviews} review{totalReviews!==1?"s":""}</p>
                  </div>
                  <div className="flex-1 w-full space-y-2">
                    {ratingCounts.map(({ n, count }) => {
                      const pct = totalReviews > 0 ? Math.round((count/totalReviews)*100) : 0;
                      return (
                        <div key={n} className="flex items-center gap-3">
                          <span className="text-xs text-stone-500 w-3 text-right flex-shrink-0">{n}</span>
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400 flex-shrink-0" />
                          <div className="flex-1 h-2 bg-stone-200 rounded-full overflow-hidden">
                            <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width:`${pct}%` }} />
                          </div>
                          <span className="text-xs text-stone-400 w-5 flex-shrink-0">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Review cards */}
                <div className="space-y-5">
                  {reviews.map((r: any) => (
                    <div key={r.id} className="pb-5 border-b border-stone-100 last:border-0 last:pb-0">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-9 h-9 rounded-full text-white text-sm font-bold flex items-center justify-center flex-shrink-0" style={{ background: PURPLE }}>
                            {(r.reviewer_username || "?")[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-stone-900">@{r.reviewer_username}</p>
                            {r.listing_title && <p className="text-xs text-stone-400 truncate max-w-[200px]">{r.listing_title}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <div className="flex gap-0.5">
                            {[1,2,3,4,5].map(n => <Star key={n} className={`w-3.5 h-3.5 ${n<=r.rating?"fill-amber-400 text-amber-400":"fill-stone-200 text-stone-200"}`} />)}
                          </div>
                          <span className="text-xs text-stone-400">{new Date(r.created_at).toLocaleDateString("en-NG",{day:"numeric",month:"short",year:"numeric"})}</span>
                        </div>
                      </div>
                      {r.comment && <p className="text-sm text-stone-500 leading-relaxed pl-11">{r.comment}</p>}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </>
        )}

        {/* ── About tab ── */}
        {tab === "about" && (
          <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.2 }}
            className="max-w-xl space-y-4">

            {vendor.bio && (
              <div className="bg-stone-50 rounded-2xl border border-stone-100 p-5">
                <p className="text-teal-600 text-[10px] tracking-[0.18em] uppercase font-bold mb-2">About</p>
                <p className="text-stone-600 text-sm leading-relaxed">{vendor.bio}</p>
              </div>
            )}

            {(availDays.length > 0 || vendor.opening_time) && (
              <div className="bg-stone-50 rounded-2xl border border-stone-100 p-5">
                <p className="text-teal-600 text-[10px] tracking-[0.18em] uppercase font-bold mb-3">Hours & Availability</p>
                {availDays.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap mb-3">
                    {DAYS.map(d => (
                      <div key={d} className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold transition-colors ${
                        isDayOpen(d) ? "bg-teal-500 text-white shadow-sm shadow-teal-200" : "bg-stone-100 text-stone-300"
                      }`}>
                        {DAY_LBL[d]}
                      </div>
                    ))}
                  </div>
                )}
                {vendor.opening_time && vendor.closing_time && (
                  <div className="flex items-center gap-1.5 text-sm text-stone-600 font-medium">
                    <Clock className="w-4 h-4 text-teal-500 flex-shrink-0" />
                    {vendor.opening_time} – {vendor.closing_time}
                  </div>
                )}
              </div>
            )}

            {vendor.school && (
              <div className="bg-stone-50 rounded-2xl border border-stone-100 p-5">
                <p className="text-teal-600 text-[10px] tracking-[0.18em] uppercase font-bold mb-2">School</p>
                <p className="text-stone-700 font-semibold text-sm">{vendor.school.toUpperCase()}</p>
              </div>
            )}

            {/* Admin section */}
            {isAdmin && (
              <div className="bg-purple-50 rounded-2xl border border-purple-100 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Shield className="w-4 h-4 text-purple-500" />
                  <p className="text-purple-600 text-[10px] tracking-[0.18em] uppercase font-bold">Admin</p>
                </div>
                <div className="text-sm text-stone-600 space-y-1.5 mb-4">
                  {vendor.email     && <p><span className="font-semibold">Email:</span> {vendor.email}</p>}
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
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold bg-purple-100 text-purple-700 hover:bg-purple-200 transition">
                    <BellRing className="w-3.5 h-3.5" /> Notify
                  </button>
                  <button onClick={handleRevoke} disabled={!!adminLoading}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold transition disabled:opacity-50 ${confirmRevoke ? "bg-red-500 text-white" : "bg-red-100 text-red-700 hover:bg-red-200"}`}>
                    <UserX className="w-3.5 h-3.5" />
                    {adminLoading === "revoke" ? "…" : confirmRevoke ? "Confirm?" : "Revoke"}
                  </button>
                </div>
              </div>
            )}

          </motion.div>
        )}

      </div>
    </div>
  );
}
