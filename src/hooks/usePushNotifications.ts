"use client";

import { useEffect, useRef } from "react";
import { useAuth, getToken as getAuthToken } from "@/lib/authStore";
import { api } from "@/lib/api";
import { getFirebaseMessaging } from "@/lib/firebase";

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
const STORED_TOKEN_KEY = "fcm_token";

export function usePushNotifications() {
  const { isLoggedIn } = useAuth();
  const unsubMessageRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!isLoggedIn || !VAPID_KEY) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;

    let swReg: ServiceWorkerRegistration | null = null;

    // Sends the current FCM token to the backend if it changed since last sync.
    const syncToken = async () => {
      try {
        if (Notification.permission !== "granted") return;
        const messaging = await getFirebaseMessaging();
        if (!messaging || !swReg) return;

        const { getToken } = await import("firebase/messaging");
        const fcmToken = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: swReg,
        });

        if (!fcmToken || !getAuthToken()) return;

        const stored = localStorage.getItem(STORED_TOKEN_KEY);
        if (fcmToken === stored) return;

        const res = await api.notifications.registerToken(fcmToken);
        if (res.ok) {
          localStorage.setItem(STORED_TOKEN_KEY, fcmToken);
        } else {
          console.warn("[FCM] Token refresh save failed:", res.status);
        }
      } catch (err) {
        console.warn("[FCM] Token sync failed:", err);
      }
    };

    // Full setup: request permission, register SW, get token, subscribe to foreground messages.
    const register = async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;

        const messaging = await getFirebaseMessaging();
        if (!messaging) return;

        const { getToken, onMessage } = await import("firebase/messaging");

        swReg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
        await navigator.serviceWorker.ready;

        const fcmToken = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: swReg,
        });

        if (!fcmToken) {
          console.warn("[FCM] No token returned — check VAPID key and SW registration");
          return;
        }
        if (!getAuthToken()) return;

        const stored = localStorage.getItem(STORED_TOKEN_KEY);
        if (fcmToken !== stored) {
          const res = await api.notifications.registerToken(fcmToken);
          if (res.ok) {
            localStorage.setItem(STORED_TOKEN_KEY, fcmToken);
          } else {
            console.warn("[FCM] Token save failed:", res.status);
          }
        }

        // Only one foreground listener at a time
        unsubMessageRef.current?.();
        unsubMessageRef.current = onMessage(messaging, (payload) => {
          const title = payload.notification?.title || "StudEx";
          const body = payload.notification?.body || "";
          if (Notification.permission === "granted" && swReg) {
            swReg.showNotification(title, {
              body,
              icon: "/images/logo-1.jpg",
              badge: "/images/logo-1.jpg",
              data: payload.data || {},
            });
          }
        });
      } catch (err) {
        console.warn("[FCM] Push notification setup failed:", err);
      }
    };

    register();
    window.addEventListener("focus", syncToken);

    return () => {
      window.removeEventListener("focus", syncToken);
      unsubMessageRef.current?.();
      unsubMessageRef.current = null;
    };
  }, [isLoggedIn]);
}
