"use client";

import {
  Package, Heart, Settings, HelpCircle, LogOut, ChevronRight,
  Store, Clock, Banknote, LayoutDashboard,
  Calendar, Gift, Bell, X, CheckCheck, ExternalLink, Camera,
  Trash2, ZoomIn, Move, MessageCircle, ArrowUpRight, Pencil,
  ShieldCheck, KeyRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/authStore";
import { GRAD, GRAD_TEXT, SERIF } from "@/lib/tokens";
import { api } from "@/lib/api";

function VerifiedTick({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full flex-shrink-0" style={{ background: color }} title={label}>
      <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none">
        <path d="M2.5 6L4.5 8.5L9.5 3.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

const POLL_INTERVAL = 30_000;
const isApprovedVendor = (u: any) => !!u?.is_verified_vendor;
const isPendingVendor  = (u: any) => u?.vendor_application_pending || (u?.user_type === "vendor" && !u?.is_verified_vendor);

/* ── CanvasCrop (unchanged) ─────────────────────────────────────────────── */
function CanvasCrop({ src, onCrop, onCancel }: { src: string; onCrop: (blob: Blob) => void; onCancel: () => void }) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale]   = useState(1);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const SIZE = 280;

  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      setImg(image);
      const s = Math.min(SIZE / image.width, SIZE / image.height);
      setScale(s);
      setOffset({ x: (SIZE - image.width * s) / 2, y: (SIZE - image.height * s) / 2 });
    };
    image.src = src;
  }, [src]);

  useEffect(() => {
    if (!img || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d")!;
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.drawImage(img, offset.x, offset.y, img.width * scale, img.height * scale);
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.drawImage(img, offset.x, offset.y, img.width * scale, img.height * scale);
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, SIZE - 2, SIZE - 2);
  }, [img, offset, scale]);

  const onMouseDown = (e: React.MouseEvent) => { setDragging(true); dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }; };
  const onMouseMove = (e: React.MouseEvent) => { if (!dragging) return; setOffset({ x: dragStart.current.ox + (e.clientX - dragStart.current.x), y: dragStart.current.oy + (e.clientY - dragStart.current.y) }); };
  const onMouseUp   = () => setDragging(false);
  const onTouchStart = (e: React.TouchEvent) => { const t = e.touches[0]; setDragging(true); dragStart.current = { x: t.clientX, y: t.clientY, ox: offset.x, oy: offset.y }; };
  const onTouchMove  = (e: React.TouchEvent) => { if (!dragging) return; const t = e.touches[0]; setOffset({ x: dragStart.current.ox + (t.clientX - dragStart.current.x), y: dragStart.current.oy + (t.clientY - dragStart.current.y) }); };
  const onTouchEnd   = () => setDragging(false);

  const handleDone = () => {
    if (!canvasRef.current || !img) return;
    const out = document.createElement("canvas");
    out.width = 400; out.height = 400;
    const ctx = out.getContext("2d")!;
    const ratio = 400 / SIZE;
    ctx.drawImage(img, offset.x * ratio, offset.y * ratio, img.width * scale * ratio, img.height * scale * ratio);
    out.toBlob(b => { if (b) onCrop(b); }, "image/jpeg", 0.92);
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative cursor-move rounded-2xl overflow-hidden" style={{ width: SIZE, height: SIZE }}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
        <canvas ref={canvasRef} width={SIZE} height={SIZE} />
      </div>
      <div className="w-full flex items-center gap-3 px-2">
        <span className="text-xs text-stone-400">−</span>
        <input type="range" min={0.5} max={3} step={0.01} value={scale} onChange={e => setScale(Number(e.target.value))} className="flex-1 accent-teal-500" />
        <span className="text-xs text-stone-400">+</span>
      </div>
      <p className="text-xs text-stone-400 flex items-center gap-1"><Move className="w-3 h-3" /> Drag to reposition · Slide to zoom</p>
      <div className="flex gap-3 w-full">
        <button onClick={onCancel} className="flex-1 py-3 rounded-full border border-stone-200 text-stone-600 text-sm font-medium hover:bg-stone-50 transition">Cancel</button>
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={handleDone} disabled={!img}
          className="flex-1 py-3 rounded-full text-white text-sm font-semibold shadow-lg disabled:opacity-50" style={{ background: GRAD }}>
          Done & Upload
        </motion.button>
      </div>
    </div>
  );
}

/* ── Row component ──────────────────────────────────────────────────────── */
function Row({ href, icon: Icon, iconColor = "#0d9488", label, badge, toggle, onToggle, toggleLoading, last = false }: {
  href?: string; icon: React.ElementType; iconColor?: string;
  label: string; badge?: number; toggle?: boolean;
  onToggle?: () => void; toggleLoading?: boolean; last?: boolean;
}) {
  const inner = (
    <div className={`flex items-center gap-3.5 px-4 py-3.5 active:bg-stone-50 transition-colors ${!last ? "border-b border-stone-100" : ""}`}>
      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: iconColor + "18" }}>
        <Icon className="w-4.5 h-4.5 flex-shrink-0" style={{ color: iconColor }} />
      </div>
      <p className="flex-1 text-sm font-medium text-stone-800">{label}</p>
      {badge !== undefined && badge > 0 && (
        <span className="bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 flex-shrink-0">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
      {toggle !== undefined ? (
        <button onClick={e => { e.preventDefault(); onToggle?.(); }} disabled={toggleLoading}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-50 ${toggle ? "bg-teal-500" : "bg-stone-300"}`}>
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${toggle ? "translate-x-6" : "translate-x-1"}`} />
        </button>
      ) : (
        <ChevronRight className="w-4 h-4 text-stone-300 flex-shrink-0" />
      )}
    </div>
  );
  if (href) return <Link href={href}>{inner}</Link>;
  return <div>{inner}</div>;
}

/* ── Main Page ─────────────────────────────────────────────────────────── */
export default function AccountPage() {
  const router = useRouter();
  const { user, isLoggedIn, isHydrated, logout } = useAuth();

  const [loading, setLoading]                 = useState(true);
  const [hasBankAccount, setHasBankAccount]   = useState(false);
  const [pendingBookings, setPendingBookings] = useState(0);
  const [unreadMessages, setUnreadMessages]   = useState(0);
  const [pendingOrders, setPendingOrders]     = useState(0);
  const [notifications, setNotifications]     = useState<any[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [showNotifications, setShowNotifications]     = useState(false);

  const [profilePic, setProfilePic] = useState<string | null>(null);
  const [uploading, setUploading]   = useState(false);
  const [toast, setToast]           = useState("");

  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [rawSrc, setRawSrc]               = useState<string>("");
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [emailNotifs, setEmailNotifs]           = useState<boolean>(true);
  const [emailNotifsLoading, setEmailNotifsLoading] = useState(false);
  const [selectedNotif, setSelectedNotif]   = useState<any>(null);
  const [showNotifDetail, setShowNotifDetail] = useState(false);

  const fileInputRef      = useRef<HTMLInputElement>(null);
  const isNavigating      = useRef(false);
  const prevVendorStatus  = useRef<boolean | null>(null);
  const pollTimer         = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => { if (isHydrated && !isLoggedIn) router.push("/auth"); }, [isHydrated, isLoggedIn, router]);
  useEffect(() => { if (user?.profile_image) setProfilePic(user.profile_image); }, [user]);
  useEffect(() => { if (user?.profile?.email_notifications !== undefined) setEmailNotifs(!!user.profile.email_notifications); }, [user]);

  const showToast = (msg: string, duration = 3000) => { setToast(msg); setTimeout(() => setToast(""), duration); };

  const pollStatus = useCallback(async () => {
    try {
      const res = await api.notifications.status();
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications || []);
      setUnreadNotifications(data.unread_notifications || 0);
      setUnreadMessages(data.unread_messages || 0);
      setPendingBookings(data.pending_bookings || 0);
      setPendingOrders(data.pending_orders || 0);
      useAuth.getState().updateUser({ is_verified_vendor: data.is_verified_vendor, user_type: data.user_type });
      const wasVendor = prevVendorStatus.current;
      const isNowVendor = !!data.is_verified_vendor;
      if (wasVendor === false && isNowVendor) { router.push("/vendor/dashboard"); return; }
      prevVendorStatus.current = isNowVendor;
    } catch {}
  }, [router]);

  useEffect(() => {
    if (!isHydrated || !isLoggedIn) return;
    let cancelled = false;
    const init = async () => {
      try {
        await pollStatus();
        if (cancelled) return;
        const cu = useAuth.getState().user;
        if (isApprovedVendor(cu)) {
          try {
            const r = await api.payments.bankAccount();
            if (r.ok && !cancelled) { const d = await r.json(); setHasBankAccount(!!d?.account_number); }
          } catch {}
        }
        if (prevVendorStatus.current === null) prevVendorStatus.current = !!useAuth.getState().user?.is_verified_vendor;
      } finally { if (!cancelled) setLoading(false); }
    };
    init();
    pollTimer.current = setInterval(pollStatus, POLL_INTERVAL);
    return () => { cancelled = true; if (pollTimer.current) clearInterval(pollTimer.current); };
  }, [isHydrated, isLoggedIn, pollStatus]);

  const handleLogout = async () => {
    if (pollTimer.current) clearInterval(pollTimer.current);
    try { await api.auth.logout(); } catch {}
    logout();
    router.push("/auth");
  };

  const markAllRead = async () => {
    try {
      await api.notifications.markAllRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadNotifications(0);
    } catch {}
  };

  const handleNotifClick = async (n: any) => {
    if (!n.is_read) {
      try {
        await api.notifications.markRead(n.id);
        setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x));
        setUnreadNotifications(prev => Math.max(0, prev - 1));
      } catch {}
    }
    setSelectedNotif(n);
    setShowNotifDetail(true);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { showToast("Please select an image file"); return; }
    if (file.size > 10 * 1024 * 1024) { showToast("Image must be under 10MB"); return; }
    const reader = new FileReader();
    reader.onload = () => { setRawSrc(reader.result as string); setCropModalOpen(true); setViewModalOpen(false); };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCrop = async (blob: Blob) => {
    setCropModalOpen(false); setUploading(true);
    try {
      const formData = new FormData();
      formData.append("profile_image", blob, "profile.jpg");
      const res = await api.auth.updateProfile(formData);
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      const newPic = data.profile_image || data.user?.profile_image;
      if (newPic) { setProfilePic(newPic); useAuth.getState().updateUser({ profile_image: newPic }); }
      showToast("Profile photo updated ✓");
    } catch { showToast("Upload failed — please try again"); }
    finally { setUploading(false); setRawSrc(""); }
  };

  const handleDeletePic = async () => {
    setViewModalOpen(false); setUploading(true);
    try {
      const res = await api.auth.updateProfile({ profile_image: null });
      if (!res.ok) throw new Error();
      setProfilePic(null); useAuth.getState().updateUser({ profile_image: null });
      showToast("Profile photo removed");
    } catch { showToast("Could not remove photo — try again"); }
    finally { setUploading(false); }
  };

  const handleEmailNotifsToggle = async () => {
    const next = !emailNotifs;
    setEmailNotifs(next);
    setEmailNotifsLoading(true);
    try {
      const res = await api.auth.updateProfile({ email_notifications: next });
      if (!res.ok) { setEmailNotifs(!next); showToast("Could not update preference"); }
    } catch { setEmailNotifs(!next); showToast("Could not update preference"); }
    finally { setEmailNotifsLoading(false); }
  };

  const getNotifIcon = (type: string) => ({
    seller_approved: "🎉", seller_rejected: "❌", seller_revoked: "⚠️",
    new_booking_request: "📅", booking_confirmed: "✅", booking_cancelled: "🚫",
    payment_received: "💰", order_completed: "📦", message: "💬",
  }[type] || "🔔");

  if (!isHydrated || loading) {
    return (
      <div className="min-h-screen bg-[#F4F5F7] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-stone-200 border-t-teal-500 rounded-full animate-spin" />
      </div>
    );
  }

  const currentUser    = useAuth.getState().user ?? user;
  const vendorApproved = isApprovedVendor(currentUser);
  const vendorPending  = isPendingVendor(currentUser);
  const isAdmin        = currentUser?.email === "studex.ng@gmail.com";
  const initials       = (currentUser?.username?.[0] || currentUser?.email?.[0] || "U").toUpperCase();
  const pic            = profilePic ?? user?.profile_image;

  /* ══════════════════════════════════════════════════════════════════════ */
  return (
    <>
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ y: -50, opacity: 0 }} animate={{ y: 60, opacity: 1 }} exit={{ opacity: 0 }}
            className={`fixed top-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full shadow-lg z-[100] font-medium text-sm text-white ${
              toast.includes("failed") || toast.includes("must") || toast.includes("select") || toast.includes("Could") ? "bg-red-500" : "bg-teal-600"
            }`}>
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />

      {/* Notification detail modal */}
      <AnimatePresence>
        {showNotifDetail && selectedNotif && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center px-4 pb-24 pt-4"
            onClick={() => setShowNotifDetail(false)}>
            <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
              className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{getNotifIcon(selectedNotif.type)}</span>
                  <h3 className="font-bold text-stone-900 text-sm">{selectedNotif.title}</h3>
                </div>
                <button onClick={() => setShowNotifDetail(false)} className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-500 hover:bg-stone-200 transition">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="px-5 py-4 space-y-3">
                <p className="text-stone-600 text-sm leading-relaxed">{selectedNotif.message}</p>
                <p className="text-xs text-stone-400">{new Date(selectedNotif.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
              </div>
              <div className="px-5 pb-5 flex gap-3">
                {selectedNotif.action_url && !selectedNotif.action_url.includes("/seller") && !selectedNotif.action_url.includes("/auth") && (
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                    onClick={() => { setShowNotifDetail(false); setShowNotifications(false); isNavigating.current = true; router.push(selectedNotif.action_url); setTimeout(() => { isNavigating.current = false; }, 2000); }}
                    className="flex-1 py-3 rounded-full text-white text-sm font-semibold shadow-lg" style={{ background: GRAD }}>
                    Go There
                  </motion.button>
                )}
                <button onClick={() => setShowNotifDetail(false)} className="flex-1 py-3 rounded-full border border-stone-200 text-stone-600 text-sm font-medium hover:bg-stone-50 transition">Close</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Crop modal */}
      <AnimatePresence>
        {cropModalOpen && rawSrc && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
              className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
                <h3 className="font-bold text-stone-900">Adjust Photo</h3>
                <button onClick={() => { setCropModalOpen(false); setRawSrc(""); }} className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-500 hover:bg-stone-200 transition">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5">
                <CanvasCrop src={rawSrc} onCrop={handleCrop} onCancel={() => { setCropModalOpen(false); setRawSrc(""); }} />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* View modal */}
      <AnimatePresence>
        {viewModalOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setViewModalOpen(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-xs" onClick={e => e.stopPropagation()}>
              <div className="w-64 h-64 mx-auto rounded-2xl overflow-hidden shadow-2xl ring-4 ring-white/20">
                {pic ? <img src={pic} alt="Profile" className="w-full h-full object-cover block" />
                     : <div className="w-full h-full flex items-center justify-center text-white text-6xl font-bold" style={{ background: GRAD }}>{initials}</div>}
              </div>
              <div className="flex gap-3 mt-6 justify-center flex-wrap">
                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  onClick={() => { setViewModalOpen(false); setTimeout(() => fileInputRef.current?.click(), 150); }}
                  className="px-6 py-3 rounded-full text-white text-sm font-semibold shadow-lg flex items-center gap-2" style={{ background: GRAD }}>
                  <Camera className="w-4 h-4" /> Change Photo
                </motion.button>
                {pic && (
                  <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={handleDeletePic}
                    className="px-6 py-3 rounded-full bg-white text-red-500 text-sm font-semibold shadow-lg border border-red-100 flex items-center gap-2">
                    <Trash2 className="w-4 h-4" /> Remove
                  </motion.button>
                )}
              </div>
              <button onClick={() => setViewModalOpen(false)} className="w-full mt-4 text-center text-white/50 text-sm hover:text-white transition">Close</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════ PAGE ══════════ */}
      <div className="min-h-screen bg-[#F4F5F7]" style={{ fontFamily: "'DM Sans', sans-serif" }}>

        {/* ── HEADER ── */}
        <div className="bg-[#F4F5F7] px-4 pt-5 pb-2 flex items-center justify-between">
          <Link href="/home">
            <button className="w-9 h-9 rounded-full bg-white shadow-sm flex items-center justify-center">
              <svg className="w-4 h-4 text-stone-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          </Link>
          <h1 className="text-base font-bold text-stone-900">Profile & Settings</h1>
          <div className="relative">
            <button onClick={() => setShowNotifications(v => !v)}
              className="w-9 h-9 bg-white shadow-sm rounded-full flex items-center justify-center">
              <Bell className="w-4 h-4 text-stone-600" />
              {unreadNotifications > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[15px] h-[15px] flex items-center justify-center px-0.5">
                  {unreadNotifications > 9 ? "9+" : unreadNotifications}
                </span>
              )}
            </button>
            <AnimatePresence>
              {showNotifications && (
                <motion.div initial={{ opacity: 0, y: -8, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                  className="absolute right-0 top-12 w-80 bg-white rounded-2xl shadow-xl border border-stone-100 z-50 overflow-hidden">
                  <div className="flex items-center justify-between p-4 border-b border-stone-100">
                    <h3 className="font-bold text-stone-900 text-sm">Notifications</h3>
                    <div className="flex items-center gap-2">
                      {unreadNotifications > 0 && (
                        <button onClick={markAllRead} className="text-xs text-teal-600 hover:underline flex items-center gap-1">
                          <CheckCheck className="w-3 h-3" /> Mark all read
                        </button>
                      )}
                      <button onClick={() => setShowNotifications(false)} className="text-stone-400 hover:text-stone-600"><X className="w-4 h-4" /></button>
                    </div>
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {notifications.length === 0
                      ? <div className="p-6 text-center text-stone-400 text-sm">No notifications yet</div>
                      : notifications.map((n: any) => (
                        <div key={n.id} onClick={() => handleNotifClick(n)}
                          className={`p-4 border-b border-stone-50 last:border-0 cursor-pointer hover:bg-stone-50 transition ${!n.is_read ? "bg-teal-50/50" : ""}`}>
                          <div className="flex items-start gap-3">
                            <span className="text-base flex-shrink-0 mt-0.5">{getNotifIcon(n.type)}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <p className="font-semibold text-sm text-stone-900 truncate">{n.title}</p>
                                {!n.is_read && <span className="w-2 h-2 bg-teal-500 rounded-full flex-shrink-0" />}
                              </div>
                              <p className="text-xs text-stone-500 mt-0.5 line-clamp-2">{n.message}</p>
                              <div className="flex items-center justify-between mt-1">
                                <p className="text-xs text-stone-400">{new Date(n.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                                {n.action_url && <span className="text-xs text-teal-600 flex items-center gap-0.5">View <ExternalLink className="w-3 h-3" /></span>}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    }
                  </div>
                  <div className="border-t border-stone-100">
                    <Link href="/account/notifications" onClick={() => setShowNotifications(false)}>
                      <div className="flex items-center justify-center gap-1.5 py-3 text-xs font-semibold text-teal-600 hover:bg-teal-50 transition">
                        See all <ArrowUpRight className="w-3 h-3" />
                      </div>
                    </Link>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="px-4 pb-32 max-w-lg lg:max-w-4xl mx-auto">
          <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-6 lg:items-start">
          <div className="space-y-1">

          {/* ── PROFILE ROW ── */}
          <div className="bg-white rounded-2xl px-4 py-4 flex items-center gap-3 mt-3 shadow-sm">
            <motion.button whileTap={{ scale: 0.95 }} onClick={() => setViewModalOpen(true)} className="relative flex-shrink-0">
              <div className="w-14 h-14 rounded-full overflow-hidden ring-2 ring-stone-100 shadow-sm">
                {uploading
                  ? <div className="w-full h-full flex items-center justify-center" style={{ background: GRAD }}>
                      <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    </div>
                  : pic
                    ? <img src={pic} alt="Profile" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-white text-xl font-bold" style={{ background: GRAD }}>{initials}</div>
                }
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full border-2 border-white shadow flex items-center justify-center" style={{ background: "#0d9488" }}>
                <Camera className="w-2.5 h-2.5 text-white" />
              </div>
            </motion.button>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="font-bold text-stone-900 text-base leading-tight">{currentUser?.username || "Campus User"}</p>
                {isAdmin && <VerifiedTick color="#F59E0B" label="StudEx Administrator" />}
                {!isAdmin && vendorApproved && <VerifiedTick color="#10b981" label="Verified Vendor" />}
              </div>
              <p className="text-xs text-stone-400 truncate mt-0.5">{currentUser?.email}</p>
              {vendorPending && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 mt-1 inline-block">⏳ Pending Approval</span>
              )}
            </div>

            <button onClick={() => setViewModalOpen(true)} className="w-9 h-9 rounded-full bg-stone-100 flex items-center justify-center flex-shrink-0 hover:bg-stone-200 transition">
              <Pencil className="w-4 h-4 text-stone-500" />
            </button>
          </div>

          {/* ── VENDOR / PLAN CARD ── */}
          {vendorApproved ? (
            <Link href="/vendor/dashboard">
              <motion.div whileTap={{ scale: 0.98 }}
                className="relative rounded-2xl p-5 overflow-hidden shadow-md mt-4"
                style={{ background: "linear-gradient(135deg, #0d9488 0%, #0f766e 100%)" }}>
                <div className="absolute top-0 right-0 w-28 h-28 rounded-full bg-white/10 blur-2xl pointer-events-none" />
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-black text-white text-lg leading-tight" style={SERIF}>StudEx</p>
                      <span className="bg-white/20 text-white text-[10px] font-bold px-2 py-0.5 rounded-full border border-white/30">VENDOR</span>
                    </div>
                    <p className="text-white/80 text-xs leading-relaxed">Manage your listings, bookings, and earnings all in one place.</p>
                  </div>
                  <ShieldCheck className="w-10 h-10 text-white/40 flex-shrink-0 mt-0.5" />
                </div>
                <div className="mt-4 bg-white/15 rounded-xl py-2.5 text-center">
                  <p className="text-white text-sm font-semibold">Go to Vendor Dashboard →</p>
                </div>
              </motion.div>
            </Link>
          ) : vendorPending ? (
            <div className="relative rounded-2xl p-5 overflow-hidden shadow-sm mt-4 bg-amber-50 border border-amber-200">
              <div className="flex items-center gap-3">
                <Clock className="w-9 h-9 text-amber-400 flex-shrink-0 animate-pulse" />
                <div>
                  <p className="font-bold text-amber-800 text-sm">Application Under Review</p>
                  <p className="text-xs text-amber-600 mt-0.5">We're reviewing your vendor application. You'll be notified once approved.</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="relative rounded-2xl p-5 overflow-hidden shadow-md mt-4" style={{ background: "linear-gradient(135deg, #7c3aed 0%, #0d9488 100%)" }}>
              <div className="absolute top-0 right-0 w-28 h-28 rounded-full bg-white/10 blur-2xl pointer-events-none" />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-black text-white text-lg leading-tight" style={SERIF}>StudEx</p>
                    <span className="bg-white/20 text-white text-[10px] font-bold px-2 py-0.5 rounded-full border border-white/30">VENDOR</span>
                  </div>
                  <p className="text-white/80 text-xs leading-relaxed">Sell on campus. Earn from your skills, products & services.</p>
                </div>
                <Store className="w-10 h-10 text-white/40 flex-shrink-0 mt-0.5" />
              </div>
              <Link href="/vendor/apply">
                <div className="mt-4 bg-white rounded-xl py-2.5 text-center">
                  <p className="text-stone-800 text-sm font-semibold">Apply to become a vendor</p>
                </div>
              </Link>
            </div>
          )}

          {/* ── SECTION: My Account ── */}
          <p className="text-xs font-semibold text-stone-500 pt-5 pb-2 px-1">My Account</p>
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
            <Row href="/account/orders"        icon={Package}       iconColor="#6366f1" label="My Orders"       badge={pendingOrders} />
            <Row href="/account/bookings"       icon={Calendar}      iconColor="#0d9488" label="My Bookings"     badge={vendorApproved ? 0 : pendingBookings} />
            <Row href="/chat"                   icon={MessageCircle} iconColor="#0d9488" label="Messages"        badge={unreadMessages} />
            <Row href="/account/notifications"  icon={Bell}          iconColor="#f59e0b" label="Notifications"   badge={unreadNotifications} />
            <Row href="/account/loyalty"        icon={Gift}          iconColor="#10b981" label="Loyalty Rewards" />
            <Row href="/wishlist"               icon={Heart}         iconColor="#ec4899" label="Wishlist"        last />
          </div>

          {/* ── SECTION: Vendor (if approved) ── */}
          {vendorApproved && (
            <>
              <p className="text-xs font-semibold text-stone-500 pt-5 pb-2 px-1">Vendor Tools</p>
              <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
                <Row href="/vendor/dashboard"   icon={LayoutDashboard} iconColor="#0d9488" label="Vendor Dashboard" />
                <Row href="/account/bank-account" icon={Banknote}       iconColor={hasBankAccount ? "#10b981" : "#f59e0b"} label={hasBankAccount ? "Payout Account" : "Add Payout Account"} last />
              </div>
            </>
          )}

          </div>{/* end left col */}
          <div className="space-y-1 mt-4 lg:mt-6 lg:sticky lg:top-20">

          {/* ── SECTION: Settings ── */}
          <p className="text-xs font-semibold text-stone-500 pt-5 lg:pt-0 pb-2 px-1">Settings</p>
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
            <Row href="/account/address"        icon={Settings}  iconColor="#3b82f6" label="Address Book" />
            <Row href="/account/change-password" icon={KeyRound} iconColor="#8b5cf6" label="Change Password" />
            <Row icon={Bell} iconColor="#0d9488" label="Email Notifications"
              toggle={emailNotifs} onToggle={handleEmailNotifsToggle} toggleLoading={emailNotifsLoading} last />
          </div>

          {/* ── SECTION: Support ── */}
          <p className="text-xs font-semibold text-stone-500 pt-5 pb-2 px-1">Help & Support</p>
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
            <Row href="/faq" icon={HelpCircle} iconColor="#14b8a6" label="FAQs & Help Center" last />
          </div>

          {/* ── LOGOUT ── */}
          <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
            onClick={handleLogout}
            className="w-full mt-5 py-3.5 bg-white border border-red-100 hover:border-red-200 text-red-500 rounded-2xl font-semibold text-sm shadow-sm hover:shadow transition-all flex items-center justify-center gap-2">
            <LogOut className="w-4 h-4" />
            Log Out
          </motion.button>

        </div>
      </div>
    </div>
      </div>
    </>
  );
}
