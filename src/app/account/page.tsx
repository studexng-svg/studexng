"use client";

import {
  Package, Heart, Settings, HelpCircle, LogOut, ChevronRight,
  Store, Clock, ArrowRight, Banknote, LayoutDashboard,
  Calendar, Gift, Bell, X, CheckCheck, ExternalLink, Camera,
  Trash2, ZoomIn, Move, MessageCircle
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth, fetchWithAuth } from "@/lib/authStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const POLL_INTERVAL = 30_000;

const isApprovedVendor = (u: any) => !!u?.is_verified_vendor;
const isPendingVendor = (u: any) => u?.user_type === "vendor" && !u?.is_verified_vendor;

// ── Menu config ───────────────────────────────────────────────────────────────
const MENU_ITEMS = [
  { href: "/account/orders",   icon: Package,       label: "My Orders",       sub: "Track your purchases",       bg: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)" },
  { href: "/account/bookings", icon: Calendar,      label: "My Bookings",     sub: "View upcoming appointments", bg: "linear-gradient(135deg, #0D9488 0%, #059669 100%)" },
  { href: "/chat",             icon: MessageCircle, label: "Messages",        sub: "Your conversations",         bg: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" },
  { href: "/account/loyalty",  icon: Gift,          label: "Loyalty Rewards", sub: "Points & exclusive deals",   bg: "linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)" },
  { href: "/wishlist",         icon: Heart,         label: "Wishlist",        sub: "Saved items",                bg: "linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)" },
  { href: "/account/address",  icon: Settings,      label: "Address Book",    sub: "Manage delivery addresses",  bg: "linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)" },
  { href: "/faq",              icon: HelpCircle,    label: "Help & Support",  sub: "FAQs and contact",           bg: "linear-gradient(135deg, #14b8a6 0%, #0ea5e9 100%)" },
];

// ── Simple Canvas Crop Component ──────────────────────────────────────────────
function CanvasCrop({
  src,
  onCrop,
  onCancel,
}: {
  src: string;
  onCrop: (blob: Blob) => void;
  onCancel: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const SIZE = 280; // canvas size

  // Load image
  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      setImg(image);
      // Center image initially
      const s = Math.max(SIZE / image.width, SIZE / image.height);
      setScale(s);
      setOffset({
        x: (SIZE - image.width * s) / 2,
        y: (SIZE - image.height * s) / 2,
      });
    };
    image.src = src;
  }, [src]);

  // Draw on canvas
  useEffect(() => {
    if (!img || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d")!;
    ctx.clearRect(0, 0, SIZE, SIZE);

    // Clip circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, offset.x, offset.y, img.width * scale, img.height * scale);
    ctx.restore();

    // Dark overlay outside circle
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.save();
    ctx.beginPath();
    ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.drawImage(img, offset.x, offset.y, img.width * scale, img.height * scale);
    ctx.restore();

    // Circle border
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 1, 0, Math.PI * 2);
    ctx.stroke();
  }, [img, offset, scale]);

  // Drag handlers
  const onMouseDown = (e: React.MouseEvent) => {
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    setOffset({
      x: dragStart.current.ox + (e.clientX - dragStart.current.x),
      y: dragStart.current.oy + (e.clientY - dragStart.current.y),
    });
  };
  const onMouseUp = () => setDragging(false);

  // Touch handlers
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    setDragging(true);
    dragStart.current = { x: t.clientX, y: t.clientY, ox: offset.x, oy: offset.y };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragging) return;
    const t = e.touches[0];
    setOffset({
      x: dragStart.current.ox + (t.clientX - dragStart.current.x),
      y: dragStart.current.oy + (t.clientY - dragStart.current.y),
    });
  };
  const onTouchEnd = () => setDragging(false);

  const handleDone = () => {
    if (!canvasRef.current || !img) return;
    // Render clean 400x400 output
    const out = document.createElement("canvas");
    out.width = 400;
    out.height = 400;
    const ctx = out.getContext("2d")!;
    const ratio = 400 / SIZE;
    ctx.beginPath();
    ctx.arc(200, 200, 200, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(
      img,
      offset.x * ratio,
      offset.y * ratio,
      img.width * scale * ratio,
      img.height * scale * ratio
    );
    out.toBlob(b => { if (b) onCrop(b); }, "image/jpeg", 0.92);
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Canvas */}
      <div
        className="relative cursor-move rounded-full overflow-hidden"
        style={{ width: SIZE, height: SIZE }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}>
        <canvas ref={canvasRef} width={SIZE} height={SIZE} />
      </div>

      {/* Zoom slider */}
      <div className="w-full flex items-center gap-3 px-2">
        <span className="text-xs text-stone-400">−</span>
        <input
          type="range"
          min={0.5}
          max={3}
          step={0.01}
          value={scale}
          onChange={e => setScale(Number(e.target.value))}
          className="flex-1 accent-teal-500"
        />
        <span className="text-xs text-stone-400">+</span>
      </div>

      <p className="text-xs text-stone-400 flex items-center gap-1">
        <Move className="w-3 h-3" /> Drag to reposition · Slide to zoom
      </p>

      {/* Buttons */}
      <div className="flex gap-3 w-full">
        <button
          onClick={onCancel}
          className="flex-1 py-3 rounded-full border border-stone-200 text-stone-600 text-sm font-medium hover:bg-stone-50 transition">
          Cancel
        </button>
        <motion.button
          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
          onClick={handleDone}
          disabled={!img}
          className="flex-1 py-3 rounded-full text-white text-sm font-semibold shadow-lg disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" }}>
          Done & Upload
        </motion.button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AccountPage() {
  const router = useRouter();
  const { user, isLoggedIn, isHydrated, logout } = useAuth();

  const [loading, setLoading] = useState(true);
  const [hasBankAccount, setHasBankAccount] = useState(false);
  const [pendingBookings, setPendingBookings] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [pendingOrders, setPendingOrders] = useState(0);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);

  const [profilePic, setProfilePic] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState("");

  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [rawSrc, setRawSrc] = useState<string>("");
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [selectedNotif, setSelectedNotif] = useState<any>(null);
  const [showNotifDetail, setShowNotifDetail] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isNavigating = useRef(false);
  const prevVendorStatus = useRef<boolean | null>(null);
  const pollTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isHydrated && !isLoggedIn) router.push("/auth");
  }, [isHydrated, isLoggedIn, router]);

  useEffect(() => {
    if (user?.profile_image) setProfilePic(user.profile_image);
  }, [user]);

  const showToast = (msg: string, duration = 3000) => {
    setToast(msg);
    setTimeout(() => setToast(""), duration);
  };

  const pollStatus = useCallback(async () => {
    try {
      const res = await fetchWithAuth(`${API_URL}/api/notifications/status/`);
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications || []);
      setUnreadNotifications(data.unread_notifications || 0);
      setUnreadMessages(data.unread_messages || 0);
      setPendingBookings(data.pending_bookings || 0);
      setPendingOrders(data.pending_orders || 0);
      useAuth.getState().updateUser({
        is_verified_vendor: data.is_verified_vendor,
        user_type: data.user_type,
      });
      const wasVendor = prevVendorStatus.current;
      const isNowVendor = !!data.is_verified_vendor;
      if (wasVendor === false && isNowVendor) { router.push("/seller"); return; }
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
            const r = await fetchWithAuth(`${API_URL}/api/payments/seller/bank-account/`);
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

  const handleLogout = () => {
    if (pollTimer.current) clearInterval(pollTimer.current);
    logout();
    router.push("/auth");
  };

  const markAllRead = async () => {
    try {
      await fetchWithAuth(`${API_URL}/api/notifications/read-all/`, { method: "POST" });
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadNotifications(0);
    } catch {}
  };

  const handleNotifClick = async (n: any) => {
    // Mark as read
    if (!n.is_read) {
      try {
        await fetchWithAuth(`${API_URL}/api/notifications/${n.id}/read/`, { method: "POST" });
        setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x));
        setUnreadNotifications(prev => Math.max(0, prev - 1));
      } catch {}
    }
    // Show full message in modal instead of navigating
    setSelectedNotif(n);
    setShowNotifDetail(true);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { showToast("Please select an image file"); return; }
    if (file.size > 10 * 1024 * 1024) { showToast("Image must be under 10MB"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      setRawSrc(reader.result as string);
      setCropModalOpen(true);
      setViewModalOpen(false);
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCrop = async (blob: Blob) => {
    setCropModalOpen(false);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("profile_image", blob, "profile.jpg");
      const res = await fetchWithAuth(`${API_URL}/api/auth/profile/update/`, { method: "PATCH", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      const newPic = data.profile_image || data.user?.profile_image;
      if (newPic) {
        setProfilePic(newPic);
        useAuth.getState().updateUser({ profile_image: newPic });
      }
      showToast("Profile photo updated ✓");
    } catch {
      showToast("Upload failed — please try again");
    } finally {
      setUploading(false);
      setRawSrc("");
    }
  };

  const handleDeletePic = async () => {
    setViewModalOpen(false);
    setUploading(true);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/auth/profile/update/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_image: null }),
      });
      if (!res.ok) throw new Error();
      setProfilePic(null);
      useAuth.getState().updateUser({ profile_image: null });
      showToast("Profile photo removed");
    } catch {
      showToast("Could not remove photo — try again");
    } finally {
      setUploading(false);
    }
  };

  const getNotifIcon = (type: string) => ({
    seller_approved: "🎉", seller_rejected: "❌", seller_revoked: "⚠️",
    new_booking_request: "📅", booking_confirmed: "✅", booking_cancelled: "🚫",
    payment_received: "💰", order_completed: "📦", message: "💬",
  }[type] || "🔔");

  if (!isHydrated || loading) {
    return (
      <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-stone-200 border-t-teal-500 rounded-full animate-spin" />
      </div>
    );
  }

  const currentUser = useAuth.getState().user ?? user;
  const vendorApproved = isApprovedVendor(currentUser);
  const vendorPending = isPendingVendor(currentUser);
  const initials = (currentUser?.username?.[0] || currentUser?.email?.[0] || "U").toUpperCase();

  const menuItems = MENU_ITEMS.map(item => ({
    ...item,
    badge: item.href === "/account/orders" ? pendingOrders
         : item.href === "/account/bookings" && !vendorApproved ? pendingBookings
         : item.href === "/chat" ? unreadMessages
         : 0,
  }));

  return (
    <>
      {/* ── TOAST ── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ y: -50, opacity: 0 }} animate={{ y: 60, opacity: 1 }} exit={{ opacity: 0 }}
            className={`fixed top-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full shadow-lg z-[100] font-medium text-sm text-white ${
              toast.includes("failed") || toast.includes("must") || toast.includes("select") || toast.includes("Could")
                ? "bg-red-500" : "bg-teal-600"
            }`}>
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── HIDDEN FILE INPUT ── */}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />

      {/* ── NOTIFICATION DETAIL MODAL ── */}
      <AnimatePresence>
        {showNotifDetail && selectedNotif && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowNotifDetail(false)}>
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
              className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{getNotifIcon(selectedNotif.type)}</span>
                  <h3 className="font-bold text-stone-900 text-sm" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                    {selectedNotif.title}
                  </h3>
                </div>
                <button onClick={() => setShowNotifDetail(false)}
                  className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-500 hover:bg-stone-200 transition">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="px-5 py-4 space-y-3">
                <p className="text-stone-600 text-sm leading-relaxed">{selectedNotif.message}</p>
                <p className="text-xs text-stone-400">
                  {new Date(selectedNotif.created_at).toLocaleDateString("en-NG", {
                    day: "numeric", month: "long", year: "numeric",
                    hour: "2-digit", minute: "2-digit"
                  })}
                </p>
              </div>

              {/* Action button — only show if there is a valid destination that is not /seller or /auth */}
              <div className="px-5 pb-5 flex gap-3">
                {selectedNotif.action_url &&
                 !selectedNotif.action_url.includes("/seller") &&
                 !selectedNotif.action_url.includes("/auth") && (
                  <motion.button
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                    onClick={() => {
                      setShowNotifDetail(false);
                      setShowNotifications(false);
                      isNavigating.current = true;
                      router.push(selectedNotif.action_url);
                      setTimeout(() => { isNavigating.current = false; }, 2000);
                    }}
                    className="flex-1 py-3 rounded-full text-white text-sm font-semibold shadow-lg"
                    style={{ background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" }}>
                    Go There
                  </motion.button>
                )}
                <button
                  onClick={() => setShowNotifDetail(false)}
                  className="flex-1 py-3 rounded-full border border-stone-200 text-stone-600 text-sm font-medium hover:bg-stone-50 transition">
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════
          CROP MODAL
      ══════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {cropModalOpen && rawSrc && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
              className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
                <h3 className="font-bold text-stone-900" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                  Adjust Photo
                </h3>
                <button
                  onClick={() => { setCropModalOpen(false); setRawSrc(""); }}
                  className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-500 hover:bg-stone-200 transition">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5">
                <CanvasCrop
                  src={rawSrc}
                  onCrop={handleCrop}
                  onCancel={() => { setCropModalOpen(false); setRawSrc(""); }}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════
          VIEW MODAL
      ══════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {viewModalOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setViewModalOpen(false)}>
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-xs"
              onClick={e => e.stopPropagation()}>
              <div className="w-64 h-64 mx-auto rounded-full overflow-hidden shadow-2xl ring-4 ring-white/20">
                {profilePic ? (
                  <img src={profilePic} alt="Profile" className="w-full h-full object-cover block" />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center text-white text-6xl font-bold"
                    style={{ background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" }}>
                    {initials}
                  </div>
                )}
              </div>
              <div className="flex gap-3 mt-6 justify-center flex-wrap">
                <motion.button
                  whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  onClick={() => { setViewModalOpen(false); setTimeout(() => fileInputRef.current?.click(), 150); }}
                  className="px-6 py-3 rounded-full text-white text-sm font-semibold shadow-lg flex items-center gap-2"
                  style={{ background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" }}>
                  <Camera className="w-4 h-4" /> Change Photo
                </motion.button>
                {profilePic && (
                  <motion.button
                    whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                    onClick={handleDeletePic}
                    className="px-6 py-3 rounded-full bg-white text-red-500 text-sm font-semibold shadow-lg border border-red-100 flex items-center gap-2">
                    <Trash2 className="w-4 h-4" /> Remove
                  </motion.button>
                )}
              </div>
              <button
                onClick={() => setViewModalOpen(false)}
                className="w-full mt-4 text-center text-white/50 text-sm hover:text-white transition">
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="min-h-screen bg-[#FAFAF9]" style={{ fontFamily: "'DM Sans', sans-serif" }}>

        {/* ── STICKY HEADER ── */}
        <div className="sticky top-0 bg-white/80 backdrop-blur-md z-40 border-b border-stone-100 shadow-sm">
          <div className="flex items-center justify-between px-4 py-3">
            <Link href="/home" className="flex items-center gap-2">
              <img src="/images/logo-1.jpg" alt="StudEx" className="w-9 h-9 rounded-full object-cover shadow-sm" />
              <span className="font-bold text-lg text-stone-900" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                Stud<span style={{
                  background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)",
                  WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
                }}>Ex</span>
              </span>
            </Link>
            <h1 className="text-base font-bold text-stone-900" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>My Account</h1>
            <div className="relative">
              <button
                onClick={() => setShowNotifications(v => !v)}
                className="relative w-9 h-9 bg-stone-100 hover:bg-stone-200 rounded-full flex items-center justify-center transition-colors">
                <Bell className="w-4 h-4 text-stone-600" />
                {unreadNotifications > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                    {unreadNotifications > 99 ? "99+" : unreadNotifications}
                  </span>
                )}
              </button>
              <AnimatePresence>
                {showNotifications && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                    className="absolute right-0 top-12 w-80 bg-white rounded-2xl shadow-xl border border-stone-100 z-50 overflow-hidden">
                    <div className="flex items-center justify-between p-4 border-b border-stone-100">
                      <h3 className="font-bold text-stone-900 text-sm" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>Notifications</h3>
                      <div className="flex items-center gap-2">
                        {unreadNotifications > 0 && (
                          <button onClick={markAllRead} className="text-xs text-teal-600 hover:underline flex items-center gap-1">
                            <CheckCheck className="w-3 h-3" /> Mark all read
                          </button>
                        )}
                        <button onClick={() => setShowNotifications(false)} className="text-stone-400 hover:text-stone-600"><X className="w-4 h-4" /></button>
                      </div>
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="p-6 text-center text-stone-400 text-sm">No notifications yet</div>
                      ) : notifications.map((n: any) => (
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
                                <p className="text-xs text-stone-400">
                                  {new Date(n.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                                </p>
                                {n.action_url && <span className="text-xs text-teal-600 flex items-center gap-0.5">View <ExternalLink className="w-3 h-3" /></span>}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        <div className="px-4 pt-6 pb-28 space-y-4 max-w-2xl mx-auto">

          {/* ── PROFILE CARD ── */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-teal-50/80 blur-2xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full bg-purple-50/80 blur-2xl pointer-events-none" />
            <div className="relative z-10 flex items-center gap-5">
              <div className="relative flex-shrink-0">
                <motion.button whileTap={{ scale: 0.96 }} onClick={() => setViewModalOpen(true)} className="relative block">
                  <div className="w-20 h-20 rounded-full overflow-hidden shadow-md ring-2 ring-stone-100">
                    {uploading ? (
                      <div className="w-full h-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" }}>
                        <div className="w-6 h-6 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      </div>
                    ) : profilePic ? (
                      <img src={profilePic} alt="Profile" className="w-full h-full object-cover block" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white text-2xl font-bold" style={{ background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" }}>
                        {initials}
                      </div>
                    )}
                  </div>
                  <div className="absolute inset-0 rounded-full bg-black/0 hover:bg-black/20 transition-colors flex items-center justify-center group">
                    <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </motion.button>
                <motion.button whileTap={{ scale: 0.9 }} onClick={() => fileInputRef.current?.click()} disabled={uploading}
                  className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full border-2 border-white shadow-md flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" }}>
                  <Camera className="w-3 h-3 text-white" />
                </motion.button>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-bold text-stone-900 truncate" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                  {currentUser?.username || "Campus User"}
                </h2>
                <p className="text-sm text-stone-400 mt-0.5 truncate">{currentUser?.email}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {vendorApproved && <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-teal-50 text-teal-700 border border-teal-200">✓ Verified Vendor</span>}
                  {vendorPending && <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">⏳ Pending Approval</span>}
                </div>
                <button onClick={() => setViewModalOpen(true)} className="mt-2 text-xs text-teal-600 hover:underline font-medium">
                  {uploading ? "Uploading..." : "View / change photo"}
                </button>
              </div>
            </div>
          </motion.div>

          {/* ── VENDOR HUB ── */}
          {vendorApproved && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
              <Link href="/vendor/dashboard">
                <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}
                  className="flex items-center justify-between p-4 rounded-2xl shadow-sm border cursor-pointer"
                  style={{ background: "linear-gradient(135deg, #0b1a18 0%, #1a0b2e 100%)", borderColor: "rgba(13,148,136,0.3)" }}>
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center shadow-md" style={{ background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" }}>
                      <LayoutDashboard className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-white text-sm">Vendor Hub</p>
                        {(unreadMessages > 0 || pendingBookings > 0) && (
                          <span className="bg-red-500 text-white text-xs font-bold rounded-full min-w-[18px] h-4 flex items-center justify-center px-1">
                            {unreadMessages + pendingBookings}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-white/50">Messages, bookings, earnings & listings</p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-white/30" />
                </motion.div>
              </Link>
            </motion.div>
          )}

          {/* ── BANK ACCOUNT ── */}
          {vendorApproved && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className={`rounded-2xl p-4 border ${hasBankAccount ? "bg-teal-50 border-teal-200" : "bg-amber-50 border-amber-200"}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${hasBankAccount ? "bg-teal-100" : "bg-amber-100"}`}>
                    <Banknote className={`w-5 h-5 ${hasBankAccount ? "text-teal-600" : "text-amber-600"}`} />
                  </div>
                  <div>
                    <p className={`font-semibold text-sm ${hasBankAccount ? "text-teal-800" : "text-amber-800"}`}>
                      {hasBankAccount ? "Payout Account Set" : "Payout Account Required"}
                    </p>
                    <p className={`text-xs ${hasBankAccount ? "text-teal-600" : "text-amber-600"}`}>
                      {hasBankAccount ? "Your earnings will be sent here" : "Add your bank account to receive payments"}
                    </p>
                  </div>
                </div>
                <Link href="/account/bank-account">
                  <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                    className="px-4 py-2 rounded-full text-xs font-semibold text-white shadow-sm"
                    style={{ background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" }}>
                    {hasBankAccount ? "Update" : "Add"}
                  </motion.button>
                </Link>
              </div>
            </motion.div>
          )}

          {/* ── PENDING BANNER ── */}
          {vendorPending && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
              <Clock className="w-8 h-8 text-amber-500 flex-shrink-0 animate-pulse" />
              <div>
                <p className="font-semibold text-amber-800 text-sm">Vendor Application Pending</p>
                <p className="text-xs text-amber-600 mt-0.5">We're reviewing your application. You'll be notified once approved!</p>
              </div>
            </motion.div>
          )}

          {/* ── SECTION LABEL ── */}
          <div className="pt-2">
            <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-semibold mb-1">Quick Access</p>
            <h2 className="text-xl font-bold text-stone-900" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>Your Space</h2>
          </div>

          {/* ── MENU ITEMS ── */}
          <div className="space-y-3">
            {menuItems.map((item, i) => (
              <motion.div key={item.href} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.06 }}>
                <Link href={item.href}>
                  <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}
                    className="bg-white border border-stone-200 hover:border-teal-300 rounded-2xl p-4 flex items-center justify-between shadow-sm hover:shadow-md transition-all">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm" style={{ background: item.bg }}>
                        <item.icon className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <p className="font-semibold text-stone-900 text-sm">{item.label}</p>
                        <p className="text-xs text-stone-400">{item.sub}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {(item as any).badge > 0 && (
                        <span className="bg-red-500 text-white text-xs font-bold rounded-full min-w-[18px] h-5 flex items-center justify-center px-1.5">
                          {(item as any).badge > 99 ? "99+" : (item as any).badge}
                        </span>
                      )}
                      <ChevronRight className="w-4 h-4 text-stone-300" />
                    </div>
                  </motion.div>
                </Link>
              </motion.div>
            ))}
          </div>

          {/* ── BECOME A VENDOR CTA ── */}
          {!vendorApproved && !vendorPending && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
              <div className="relative rounded-2xl p-5 overflow-hidden shadow-md" style={{ background: "linear-gradient(135deg, #0b1a18 0%, #1a0b2e 100%)" }}>
                <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-teal-500/20 blur-2xl pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full bg-purple-600/20 blur-2xl pointer-events-none" />
                <div className="relative z-10 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center border border-white/20" style={{ background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" }}>
                      <Store className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="font-bold text-white text-sm" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>Become a Vendor</p>
                      <p className="text-xs text-white/50">Earn on campus. List now.</p>
                    </div>
                  </div>
                  <Link href="/seller/onboarding">
                    <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                      className="px-4 py-2 bg-white text-stone-900 rounded-full text-xs font-semibold shadow-sm flex items-center gap-1.5">
                      Start <ArrowRight className="w-3.5 h-3.5" />
                    </motion.button>
                  </Link>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── LOGOUT ── */}
          <motion.button
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            onClick={handleLogout}
            className="w-full py-4 bg-white border border-red-100 hover:border-red-300 text-red-500 hover:text-red-600 rounded-2xl font-semibold text-sm shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2">
            <LogOut className="w-4 h-4" />
            Log Out
          </motion.button>

        </div>
      </div>
    </>
  );
}