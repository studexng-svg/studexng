"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell, CheckCheck, X, ExternalLink,
  CheckCircle, XCircle, AlertTriangle, Calendar, Ban, Wallet,
  AlarmClock, Package, ShoppingBag, Tag, Store, FileText, MessageCircle,
} from "lucide-react";
import TopNav from "@/components/layout/TopNav";
import { useAuth } from "@/lib/authStore";
import { GRAD, SERIF } from "@/lib/tokens";
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

export default function NotificationsPage() {
  const router = useRouter();
  const { isLoggedIn, isHydrated } = useAuth();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Notification | null>(null);

  useEffect(() => {
    if (isHydrated && !isLoggedIn) router.push("/auth");
  }, [isHydrated, isLoggedIn, router]);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await api.notifications.list();
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unread_count || 0);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!isHydrated || !isLoggedIn) return;
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000);
    return () => clearInterval(interval);
  }, [isHydrated, isLoggedIn, fetchNotifications]);

  const markAllRead = async () => {
    try {
      await api.notifications.markAllRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch {}
  };

  const handleClick = async (n: Notification) => {
    if (!n.is_read) {
      try {
        await api.notifications.markRead(n.id);
        setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x));
        setUnreadCount(prev => Math.max(0, prev - 1));
      } catch {}
    }
    setSelected({ ...n, is_read: true });
  };

  const closeDetail = () => setSelected(null);

  if (!isHydrated || loading) {
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
        {selected && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
            onClick={closeDetail}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
                <div className="flex items-center gap-2">
                  {(() => {
                    const { Icon, color, bg } = getNotifIcon(selected.type);
                    return (
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: bg }}>
                        <Icon style={{ color, width: 18, height: 18 }} />
                      </div>
                    );
                  })()}
                  <h3 className="font-bold text-stone-900 text-sm" style={SERIF}>{selected.title}</h3>
                </div>
                <button onClick={closeDetail} className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-500 hover:bg-stone-200 transition">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="px-5 py-4 space-y-3">
                <p className="text-stone-600 text-sm leading-relaxed">{selected.message}</p>
                <p className="text-xs text-stone-400">{new Date(selected.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
              </div>
              <div className="px-5 pb-5 flex gap-3">
                {selected.action_url && !selected.action_url.includes("/seller") && !selected.action_url.includes("/auth") && (
                  <motion.button
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                    onClick={() => { closeDetail(); router.push(selected.action_url); }}
                    className="flex-1 py-3 rounded-full text-white text-sm font-semibold shadow-lg"
                    style={{ background: GRAD }}
                  >
                    Go There
                  </motion.button>
                )}
                <button onClick={closeDetail} className="flex-1 py-3 rounded-full border border-stone-200 text-stone-600 text-sm font-medium hover:bg-stone-50 transition">
                  Close
                </button>
              </div>
            </motion.div>
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

          {notifications.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center py-24 text-center"
            >
              <div className="w-20 h-20 rounded-full bg-stone-100 flex items-center justify-center mb-4">
                <Bell className="w-9 h-9 text-stone-300" />
              </div>
              <p className="font-bold text-stone-700 text-lg" style={SERIF}>All caught up</p>
              <p className="text-stone-400 text-sm mt-1">No notifications yet</p>
            </motion.div>
          ) : (
            notifications.map((n, i) => (
              <motion.button
                key={n.id}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleClick(n)}
                className={`w-full text-left rounded-2xl border p-4 flex items-start gap-3 shadow-sm transition-all ${
                  !n.is_read
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
                    <p className={`text-sm leading-snug ${!n.is_read ? "font-bold text-stone-900" : "font-semibold text-stone-700"}`}>
                      {n.title}
                    </p>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {!n.is_read && <span className="w-2 h-2 bg-teal-500 rounded-full" />}
                      {n.action_url && <ExternalLink className="w-3 h-3 text-stone-300" />}
                    </div>
                  </div>
                  <p className="text-xs text-stone-500 mt-0.5 line-clamp-2 leading-relaxed">{n.message}</p>
                  <p className="text-xs text-stone-500 mt-1.5">{timeAgo(n.created_at)}</p>
                </div>
              </motion.button>
            ))
          )}

        </div>
      </div>
    </>
  );
}
