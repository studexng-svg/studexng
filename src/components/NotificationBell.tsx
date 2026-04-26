// src/components/NotificationBell.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, Check, X, Calendar, ShoppingCart, CheckCircle, AlertTriangle, Star, Package } from "lucide-react";
import { getToken } from "@/lib/authStore";   // ✅ getToken() helper, no useAuth needed here

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const TYPE_ICONS: Record<string, React.ElementType> = {
  booking_reminder:  Calendar,
  booking_confirmed: CheckCircle,
  order_update:      Package,
  new_order:         ShoppingCart,
  seller_approved:   CheckCircle,
  seller_rejected:   AlertTriangle,
  review:            Star,
  default:           Bell,
};

interface NotificationItem {
  id: number;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  action_url: string;
  created_at: string;
}

export function NotificationBell({
  unreadCount,
  markAllRead,
}: {
  unreadCount: number;
  markAllRead: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const fetchNotifications = async () => {
    const token = getToken();   // ✅ fresh token every call
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/notifications/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
      }
    } catch {}
    setLoading(false);
  };

  const handleOpen = () => {
    if (!open) fetchNotifications();
    setOpen(v => !v);
  };

  const handleClick = async (n: NotificationItem) => {
    setOpen(false);
    if (!n.is_read) {
      const token = getToken();
      if (token) {
        try {
          await fetch(`${API_URL}/api/notifications/${n.id}/read/`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          });
          setNotifications(prev =>
            prev.map(x => x.id === n.id ? { ...x, is_read: true } : x)
          );
        } catch {}
      }
    }
    if (n.action_url) router.push(n.action_url);
  };

  const handleMarkAll = () => {
    markAllRead();
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={handleOpen}
        className="relative p-2 hover:bg-purple-100 rounded-full transition"
        aria-label="Notifications"
      >
        <Bell className="w-6 h-6 text-purple-600" />
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center px-1 leading-none"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            className="absolute right-0 top-full mt-2 z-50 w-[340px] max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-purple-50 to-teal-50">
              <h3 className="font-black text-gray-900 text-sm">Notifications</h3>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAll}
                    className="text-xs text-purple-600 font-bold hover:underline flex items-center gap-1"
                  >
                    <Check className="w-3 h-3" /> Mark all read
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="p-1 hover:bg-gray-100 rounded-full">
                  <X className="w-3.5 h-3.5 text-gray-400" />
                </button>
              </div>
            </div>

            {/* List */}
            <div className="max-h-[400px] overflow-y-auto divide-y divide-gray-50">
              {loading ? (
                <div className="py-8 text-center">
                  <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="py-10 text-center">
                  <Bell className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                  <p className="text-gray-400 text-sm">No notifications yet</p>
                </div>
              ) : (
                notifications.map(n => {
                  const Icon = TYPE_ICONS[n.type] ?? TYPE_ICONS.default;
                  return (
                    <button
                      key={n.id}
                      onClick={() => handleClick(n)}
                      className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition ${
                        !n.is_read ? "bg-purple-50/60" : ""
                      }`}
                    >
                      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-0.5 ${
                        !n.is_read ? "bg-purple-100" : "bg-gray-100"
                      }`}>
                        <Icon className={`w-4 h-4 ${!n.is_read ? "text-purple-600" : "text-gray-500"}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm leading-tight ${!n.is_read ? "font-black text-gray-900" : "font-semibold text-gray-700"}`}>
                          {n.title}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 leading-relaxed">{n.message}</p>
                        <p className="text-[10px] text-gray-400 mt-1">{timeAgo(n.created_at)}</p>
                      </div>
                      {!n.is_read && (
                        <span className="flex-shrink-0 w-2 h-2 rounded-full bg-purple-500 mt-2" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
