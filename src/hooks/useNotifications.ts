// src/hooks/useNotifications.ts
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth, getToken } from "@/lib/authStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

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
  // ✅ accessToken (not token) — matches your AuthState interface
  const { isLoggedIn, accessToken } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<NodeJS.Timeout | null>(null);
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
    setToasts(prev => [item, ...prev].slice(0, 5));
    setTimeout(() => dismissToast(toastId), 6000);
  }, [dismissToast]);

  // ✅ Use getToken() helper for one-off fetch calls — avoids stale closure issues
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
      await fetch(`${API_URL}/api/notifications/mark-all-read/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      setUnreadCount(0);
    } catch {}
  }, []);

  const fetchInitialCount = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/notifications/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.unread_count || 0);
      }
    } catch {}
  }, []);

  const connect = useCallback(() => {
    // Always read fresh token at connection time to avoid stale closure
    const token = getToken();
    if (!token || !mountedRef.current) return;

    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    const url = `${API_URL}/api/notifications/stream/?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const payload: NotificationPayload = JSON.parse(event.data);
        if (payload.id && !payload.is_read) {
          addToast(payload);
          setUnreadCount(c => c + 1);
        }
      } catch {}
    };

    es.onerror = () => {
      es.close();
      esRef.current = null;
      if (!mountedRef.current) return;
      const delay = Math.min(3000 * Math.pow(1.5, Math.floor(Math.random() * 4)), 30000);
      reconnectTimer.current = setTimeout(() => {
        if (mountedRef.current) connect();
      }, delay);
    };
  }, [addToast]);

  // Re-run when accessToken changes (login/logout/token refresh)
  useEffect(() => {
    mountedRef.current = true;
    if (!isLoggedIn || !accessToken) return;

    fetchInitialCount();
    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (esRef.current) { esRef.current.close(); esRef.current = null; }
    };
  }, [isLoggedIn, accessToken, connect, fetchInitialCount]);

  return { unreadCount, toasts, dismissToast, markRead, markAllRead };
}