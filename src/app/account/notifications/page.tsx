"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell, CheckCheck, X, ExternalLink, Pin, PinOff, Trash2,
  CheckCircle, XCircle, AlertTriangle, Calendar, Ban, Wallet,
  AlarmClock, Package, ShoppingBag, Tag, Store, FileText, MessageCircle,
} from "lucide-react";
import TopNav from "@/components/layout/TopNav";
import { useAuth } from "@/lib/authStore";
import { TEAL } from "@/lib/tokens";
import { api } from "@/lib/api";

interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  action_url: string;
  created_at: string;
}

interface NotifIconDef {
  Icon: React.ComponentType<{ style?: React.CSSProperties }>;
  color: string;
  bg: string;
}

function getNotifIcon(type: string): NotifIconDef {
  switch (type) {
    case "seller_approved":
    case "vendor_approved":
      return { Icon: CheckCircle,   color: "#16a34a", bg: "#dcfce7" };
    case "seller_rejected":
      return { Icon: XCircle,       color: "#dc2626", bg: "#fee2e2" };
    case "seller_revoked":
    case "vendor_revoked":
      return { Icon: AlertTriangle, color: "#d97706", bg: "#fef3c7" };
    case "new_booking_request":
      return { Icon: Calendar,      color: "#0D9488", bg: "#CCFBF1" };
    case "booking_confirmed":
      return { Icon: CheckCircle,   color: "#0D9488", bg: "#CCFBF1" };
    case "booking_cancelled":
      return { Icon: Ban,           color: "#dc2626", bg: "#fee2e2" };
    case "booking_paid":
    case "payment_received":
      return { Icon: Wallet,        color: "#16a34a", bg: "#dcfce7" };
    case "booking_reminder_5min":
      return { Icon: AlarmClock,    color: "#d97706", bg: "#fef3c7" };
    case "booking_time_now":
      return { Icon: Bell,          color: "#7C3AED", bg: "#ede9fe" };
    case "order_completed":
      return { Icon: Package,       color: "#16a34a", bg: "#dcfce7" };
    case "order_confirmed":
      return { Icon: ShoppingBag,   color: "#0D9488", bg: "#CCFBF1" };
    case "listing_approved":
      return { Icon: Tag,           color: "#0D9488", bg: "#CCFBF1" };
    case "new_listing":
      return { Icon: Store,         color: "#7C3AED", bg: "#ede9fe" };
    case "vendor_application":
      return { Icon: FileText,      color: "#2563eb", bg: "#dbeafe" };
    case "message":
      return { Icon: MessageCircle, color: "#0D9488", bg: "#CCFBF1" };
    default:
      return { Icon: Bell,          color: "#6b7280", bg: "#f5f5f4" };
  }
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

const PINS_KEY = "notif:pinned";
const getPinned = (): number[] => {
  try { return JSON.parse(localStorage.getItem(PINS_KEY) || "[]"); } catch { return []; }
};
const savePinned = (ids: number[]) => localStorage.setItem(PINS_KEY, JSON.stringify(ids));

export default function NotificationsPage() {
  const router = useRouter();
  const { isLoggedIn, isHydrated } = useAuth();

  const [detailNotif, setDetailNotif] = useState<Notification | null>(null);
  const [actionNotif, setActionNotif] = useState<Notification | null>(null);
  const [pinnedIds, setPinnedIds] = useState<number[]>([]);
  const [deleting, setDeleting] = useState(false);
  const queryClient = useQueryClient();

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  useEffect(() => {
    if (isHydrated && !isLoggedIn) router.push("/auth");
  }, [isHydrated, isLoggedIn, router]);

  useEffect(() => {
    if (isHydrated) setPinnedIds(getPinned());
  }, [isHydrated]);

  const { data, isPending } = useQuery({
    queryKey: ["notifications-list"],
    queryFn: async (): Promise<{ notifications: Notification[]; unread_count: number }> => {
      const res = await api.notifications.list();
      if (!res.ok) throw new Error("fetch failed");
      return res.json();
    },
    enabled: isHydrated && isLoggedIn,
    refetchInterval: 15_000,
    staleTime: 5_000,
  });

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unread_count ?? 0;

  const isPinned = (id: number) => pinnedIds.includes(id);

  const sorted = [...notifications].sort((a, b) => {
    const ap = isPinned(a.id) ? 1 : 0;
    const bp = isPinned(b.id) ? 1 : 0;
    return bp - ap;
  });

  const startLongPress = useCallback((n: Notification) => {
    longPressFired.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      setActionNotif(n);
      if (navigator.vibrate) navigator.vibrate(40);
    }, 500);
  }, []);

  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  }, []);

  const handleTap = async (n: Notification) => {
    if (longPressFired.current) { longPressFired.current = false; return; }
    if (!n.is_read) {
      try {
        await api.notifications.markRead(n.id);
        queryClient.setQueryData<{ notifications: Notification[]; unread_count: number }>(
          ["notifications-list"],
          old => old ? {
            ...old,
            notifications: old.notifications.map(x => x.id === n.id ? { ...x, is_read: true } : x),
            unread_count: Math.max(0, old.unread_count - 1),
          } : old
        );
      } catch {}
    }
    setDetailNotif({ ...n, is_read: true });
  };

  const markAllRead = async () => {
    try {
      await api.notifications.markAllRead();
      queryClient.setQueryData<{ notifications: Notification[]; unread_count: number }>(
        ["notifications-list"],
        old => old ? { ...old, notifications: old.notifications.map(n => ({ ...n, is_read: true })), unread_count: 0 } : old
      );
    } catch {}
  };

  const handlePin = () => {
    if (!actionNotif) return;
    const next = isPinned(actionNotif.id)
      ? pinnedIds.filter(id => id !== actionNotif.id)
      : [...pinnedIds, actionNotif.id];
    setPinnedIds(next);
    savePinned(next);
    setActionNotif(null);
  };

  const handleDelete = async () => {
    if (!actionNotif) return;
    setDeleting(true);
    try {
      await api.notifications.delete(actionNotif.id);
      queryClient.setQueryData<{ notifications: Notification[]; unread_count: number }>(
        ["notifications-list"],
        old => old ? {
          notifications: old.notifications.filter(n => n.id !== actionNotif.id),
          unread_count: !actionNotif.is_read ? Math.max(0, old.unread_count - 1) : old.unread_count,
        } : old
      );
      setPinnedIds(prev => { const next = prev.filter(id => id !== actionNotif.id); savePinned(next); return next; });
    } catch {}
    setDeleting(false);
    setActionNotif(null);
  };

  if (!isHydrated || isPending) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-stone-200 border-t-teal-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      {/* ── DETAIL MODAL ── */}
      <AnimatePresence>
        {detailNotif && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
            onClick={() => setDetailNotif(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
                <div className="flex items-center gap-2">
                  {(() => {
                    const { Icon, color, bg } = getNotifIcon(detailNotif.type);
                    return (
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: bg }}>
                        <Icon style={{ color, width: 18, height: 18 }} />
                      </div>
                    );
                  })()}
                  <h3 className="font-bold text-stone-900 text-sm" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{detailNotif.title}</h3>
                </div>
                <button onClick={() => setDetailNotif(null)} className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-500 hover:bg-stone-200 transition">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="px-5 py-4 space-y-3">
                <p className="text-stone-600 text-sm leading-relaxed">{detailNotif.message}</p>
                <p className="text-xs text-stone-400">{new Date(detailNotif.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
              </div>
              <div className="px-5 pb-5 flex gap-3">
                {detailNotif.action_url && !detailNotif.action_url.includes("/seller") && !detailNotif.action_url.includes("/auth") && (
                  <motion.button
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                    onClick={() => { setDetailNotif(null); router.push(detailNotif.action_url); }}
                    className="flex-1 py-3 rounded-full text-white text-sm font-semibold shadow-lg"
                    style={{ background: TEAL }}
                  >
                    Go There
                  </motion.button>
                )}
                <button onClick={() => setDetailNotif(null)} className="flex-1 py-3 rounded-full border border-stone-200 text-stone-600 text-sm font-medium hover:bg-stone-50 transition">
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── LONG-PRESS BACKDROP ── */}
      <AnimatePresence>
        {actionNotif && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={() => setActionNotif(null)}
          />
        )}
      </AnimatePresence>

      {/* ── ACTION SHEET ── */}
      <AnimatePresence>
        {actionNotif && (
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl px-4 pt-3 pb-10 max-w-lg mx-auto"
            style={{ fontFamily: "'DM Sans', sans-serif" }}
          >
            <div className="w-10 h-1 bg-stone-200 rounded-full mx-auto mb-4" />

            {/* Notification preview */}
            <div className="flex items-center gap-3 px-1 mb-5">
              {(() => {
                const { Icon, color, bg } = getNotifIcon(actionNotif.type);
                return (
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: bg }}>
                    <Icon style={{ color, width: 20, height: 20 }} />
                  </div>
                );
              })()}
              <div className="min-w-0">
                <p className="font-bold text-stone-900 text-sm truncate">{actionNotif.title}</p>
                <p className="text-xs text-stone-400 truncate">{timeAgo(actionNotif.created_at)}</p>
              </div>
            </div>

            <div className="space-y-2">
              {/* Pin / Unpin */}
              <button onClick={handlePin}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-stone-50 hover:bg-teal-50 transition text-left">
                {isPinned(actionNotif.id)
                  ? <PinOff className="w-5 h-5 text-stone-500 flex-shrink-0" />
                  : <Pin className="w-5 h-5 text-teal-600 flex-shrink-0" />}
                <div>
                  <p className="font-semibold text-stone-900 text-sm">
                    {isPinned(actionNotif.id) ? "Unpin notification" : "Pin to top"}
                  </p>
                  <p className="text-xs text-stone-400">
                    {isPinned(actionNotif.id) ? "Remove from pinned" : "Keep this notification at the top"}
                  </p>
                </div>
              </button>

              {/* Delete */}
              <button onClick={handleDelete} disabled={deleting}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-red-50 hover:bg-red-100 transition text-left disabled:opacity-50">
                <Trash2 className="w-5 h-5 text-red-500 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-red-600 text-sm">{deleting ? "Deleting…" : "Delete notification"}</p>
                  <p className="text-xs text-red-400">Permanently remove this notification</p>
                </div>
              </button>

              {/* Cancel */}
              <button onClick={() => setActionNotif(null)}
                className="w-full py-3.5 rounded-2xl bg-stone-100 text-stone-600 font-semibold text-sm transition hover:bg-stone-200">
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <TopNav showBack />
        {unreadCount > 0 && (
          <div className="max-w-2xl mx-auto px-4 pt-3 flex items-center justify-between">
            <p className="text-xs text-stone-500 font-medium">{unreadCount} unread</p>
            <button
              onClick={markAllRead}
              className="flex items-center gap-1.5 text-xs font-semibold text-teal-600 hover:text-teal-700 bg-teal-50 hover:bg-teal-100 px-3 py-1.5 rounded-full transition"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Mark all read
            </button>
          </div>
        )}

        <div className="max-w-2xl mx-auto px-4 pt-4 pb-32 space-y-2">

          {sorted.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center py-24 text-center"
            >
              <div className="w-20 h-20 rounded-full bg-stone-100 flex items-center justify-center mb-4">
                <Bell className="w-9 h-9 text-stone-300" />
              </div>
              <p className="font-bold text-stone-700 text-lg" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>All caught up</p>
              <p className="text-stone-400 text-sm mt-1">No notifications yet</p>
            </motion.div>
          ) : (
            sorted.map((n, i) => {
              const pinned = isPinned(n.id);
              const isActive = actionNotif?.id === n.id;
              return (
                <motion.div
                  key={n.id}
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                  onPointerDown={() => startLongPress(n)}
                  onPointerUp={cancelLongPress}
                  onPointerCancel={cancelLongPress}
                  onPointerLeave={cancelLongPress}
                  onClick={() => handleTap(n)}
                  className={`w-full text-left rounded-2xl border p-4 flex items-start gap-3 shadow-sm transition-all cursor-pointer select-none ${
                    isActive
                      ? "border-teal-400 ring-2 ring-teal-400/25 bg-teal-50/40"
                      : !n.is_read
                      ? "bg-teal-50/60 border-teal-200 hover:border-teal-300"
                      : "bg-white border-stone-100 hover:border-stone-200"
                  }`}
                >
                  {/* Icon */}
                  {(() => {
                    const { Icon, color, bg } = getNotifIcon(n.type);
                    return (
                      <div className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: bg }}>
                        <Icon style={{ color, width: 20, height: 20 }} />
                      </div>
                    );
                  })()}

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {pinned && <Pin className="w-3 h-3 text-teal-500 flex-shrink-0" />}
                        <p className={`text-sm leading-snug truncate ${!n.is_read ? "font-bold text-stone-900" : "font-semibold text-stone-700"}`}>
                          {n.title}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {!n.is_read && <span className="w-2 h-2 bg-teal-500 rounded-full" />}
                        {n.action_url && <ExternalLink className="w-3 h-3 text-stone-300" />}
                      </div>
                    </div>
                    <p className="text-xs text-stone-500 mt-0.5 line-clamp-2 leading-relaxed">{n.message}</p>
                    <p className="text-xs text-stone-500 mt-1.5">{timeAgo(n.created_at)}</p>
                  </div>
                </motion.div>
              );
            })
          )}

        </div>
      </div>
    </>
  );
}
