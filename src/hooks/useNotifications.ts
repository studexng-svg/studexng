// src/hooks/useNotifications.ts
/**
 * useNotifications — polling-based notification system.
 *
 * SSE (stream endpoint) has been removed because it keeps a Django worker
 * thread open permanently per user, which exhausts Render's free tier workers.
 *
 * This hook works with the account page's existing pollStatus() — it simply
 * exposes the toast system for the NotificationToastContainer in layout.tsx.
 * Toasts are shown when new unread notifications arrive compared to the last poll.
 *
 * If you're using the NotificationToastContainer in layout.tsx, import this hook
 * there. If you're not using toast popups at all, you can delete this file and
 * remove the NotificationToastContainer from layout.tsx — the bell icon in the
 * account page handles everything via the status poll.
 */

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth, getToken } from "@/lib/authStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const POLL_INTERVAL = 30_000;

export interface NotificationPayload {
  id: number;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  action_url: string;
  created_at: string;
}

export interface ToastItem extends NotificationPayload {
  toastId: string;
  visible: boolean;
}

export function useNotifications() {
  const { isLoggedIn, accessToken } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const pollTimer = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);
  const lastSeenIds = useRef<Set<number>>(new Set());

  const dismissToast = useCallback((toastId: string) => {
    setToasts(prev =>
      prev.map(t => t.toastId === toastId ? { ...t, visible: false } : t)
    );
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.toastId !== toastId));
    }, 400);
  }, []);

  const addToast = useCallback((n: NotificationPayload) => {
    const toastId = `${n.id}-${Date.now()}`;
    const item: ToastItem = { ...n, toastId, visible: true };
    setToasts(prev => [item, ...prev].slice(0, 5));
    setTimeout(() => dismissToast(toastId), 6000);
  }, [dismissToast]);

  const markRead = useCallback(async (notificationId: number) => {
    const token = getToken();
    if (!token) return;
    try {
      await fetch(`${API_URL}/api/notifications/${notificationId}/read/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      setUnreadCount(c => Math.max(0, c - 1));
    } catch {}
  }, []);

  const markAllRead = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      await fetch(`${API_URL}/api/notifications/read-all/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      setUnreadCount(0);
    } catch {}
  }, []);

  // ── Poll /api/notifications/status/ instead of SSE ──────────────────────
  const poll = useCallback(async () => {
    const token = getToken();
    if (!token || !mountedRef.current) return;

    try {
      const res = await fetch(`${API_URL}/api/notifications/status/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok || !mountedRef.current) return;

      const data = await res.json();
      const notifications: NotificationPayload[] = data.notifications || [];
      const unread = data.unread_notifications || 0;

      setUnreadCount(unread);

      // Show toasts for notifications we haven't seen before
      const isFirstPoll = lastSeenIds.current.size === 0;
      notifications.forEach(n => {
        if (!n.is_read && !lastSeenIds.current.has(n.id)) {
          if (!isFirstPoll) {
            // Only toast on subsequent polls, not on page load
            addToast(n);
          }
          lastSeenIds.current.add(n.id);
        }
      });
      // Also track read ones so we don't re-toast if they get marked unread somehow
      notifications.forEach(n => lastSeenIds.current.add(n.id));

    } catch {}
  }, [addToast]);

  useEffect(() => {
    mountedRef.current = true;
    if (!isLoggedIn || !accessToken) return;

    poll(); // initial fetch
    pollTimer.current = setInterval(poll, POLL_INTERVAL);

    return () => {
      mountedRef.current = false;
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [isLoggedIn, accessToken, poll]);

  return { unreadCount, toasts, dismissToast, markRead, markAllRead };
}