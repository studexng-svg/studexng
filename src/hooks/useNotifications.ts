// src/hooks/useNotifications.ts
// ─────────────────────────────────────────────────────────────────────────────
// REPLACED: SSE (EventSource) → simple polling every 30 seconds
//
// WHY: SSE holds a Django worker thread open permanently per user.
// With Render's ~4 gunicorn workers, 4 logged-in users = all workers frozen.
//
// HOW: Polls /api/notifications/status/ every 30 seconds.
// Return signature is IDENTICAL to the old SSE version so layout.tsx,
// NotificationToast, and any other consumer needs zero changes.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth, getToken } from "@/lib/authStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const POLL_INTERVAL_MS = 30_000; // 30 seconds

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

  // Track which notification IDs we've already toasted so we don't
  // show the same one again on the next poll
  const seenIds = useRef<Set<number>>(new Set());
  const pollTimer = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

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
    setToasts(prev => [item, ...prev].slice(0, 5)); // max 5 toasts at once
    setTimeout(() => dismissToast(toastId), 6000);  // auto-dismiss after 6s
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

  // ── Core poll function ──────────────────────────────────────────────────
  const poll = useCallback(async () => {
    const token = getToken();
    if (!token || !mountedRef.current) return;

    try {
      const res = await fetch(`${API_URL}/api/notifications/status/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok || !mountedRef.current) return;

      const data = await res.json();

      // Update unread count
      setUnreadCount(data.unread_notifications ?? 0);

      // Show toasts for any NEW unread notifications we haven't seen before
      const notifications: NotificationPayload[] = data.notifications ?? [];
      for (const n of notifications) {
        if (!n.is_read && !seenIds.current.has(n.id)) {
          seenIds.current.add(n.id);
          // Don't toast on the very first load — only on subsequent polls
          // (seenIds starts empty, so first poll populates it without toasting)
          if (seenIds.current.size > notifications.length) {
            addToast(n);
          }
        } else {
          // Mark seen even if already read, so we track the baseline
          seenIds.current.add(n.id);
        }
      }
    } catch {
      // Network error — silently skip, retry on next interval
    }
  }, [addToast]);

  // ── Initialise on login, tear down on logout ───────────────────────────
  useEffect(() => {
    mountedRef.current = true;

    if (!isLoggedIn || !accessToken) {
      // Logged out — clear everything
      if (pollTimer.current) clearInterval(pollTimer.current);
      setUnreadCount(0);
      setToasts([]);
      seenIds.current.clear();
      return;
    }

    // Run immediately on login, then every 30 seconds
    poll();
    pollTimer.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [isLoggedIn, accessToken, poll]);

  // ── Return same shape as the old SSE hook ─────────────────────────────
  return { unreadCount, toasts, dismissToast, markRead, markAllRead };
}