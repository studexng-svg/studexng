"use client";

import { useEffect, useRef } from "react";
import { useAuth, getToken as getAuthToken } from "@/lib/authStore";
import { api } from "@/lib/api";
import { getFirebaseMessaging } from "@/lib/firebase";

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
const STORED_TOKEN_KEY = "fcm_token";

let swReg: ServiceWorkerRegistration | null = null;

async function setupServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    await navigator.serviceWorker.ready;
    swReg = reg;
    return reg;
  } catch {
    return null;
  }
}

async function saveToken(token: string) {
  const stored = localStorage.getItem(STORED_TOKEN_KEY);
  if (token === stored) return;
  const res = await api.notifications.registerToken(token);
  if (res.ok) localStorage.setItem(STORED_TOKEN_KEY, token);
}

// Called by the in-app prompt when the user clicks "Allow notifications".
// Returns true if permission was granted and token registered successfully.
export async function enablePushNotifications(): Promise<boolean> {
  if (!VAPID_KEY) return false;
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return false;

    const reg = swReg ?? await setupServiceWorker();
    if (!reg) return false;

    const messaging = await getFirebaseMessaging();
    if (!messaging) return false;

    const { getToken, onMessage } = await import("firebase/messaging");
    const fcmToken = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
    if (!fcmToken || !getAuthToken()) return false;

    await saveToken(fcmToken);

    // Foreground message handler
    onMessage(messaging, (payload) => {
      const title = payload.notification?.title || "StudEx";
      const body = payload.notification?.body || "";
      if (reg) reg.showNotification(title, {
        body,
        icon: "/images/logo-1.jpg",
        badge: "/images/logo-1.jpg",
        data: payload.data || {},
      });
    });

    return true;
  } catch (err) {
    console.warn("[FCM] enablePushNotifications failed:", err);
    return false;
  }
}

export function usePushNotifications() {
  const { isLoggedIn } = useAuth();
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!isLoggedIn || !VAPID_KEY) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;

    // If the user already granted permission previously, silently set up
    // the SW + token sync without asking again.
    const silentSetup = async () => {
      if (Notification.permission !== "granted") return;
      try {
        const reg = swReg ?? await setupServiceWorker();
        if (!reg) return;

        const messaging = await getFirebaseMessaging();
        if (!messaging) return;

        const { getToken, onMessage } = await import("firebase/messaging");
        const fcmToken = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
        if (!fcmToken || !getAuthToken()) return;

        await saveToken(fcmToken);

        unsubRef.current?.();
        unsubRef.current = onMessage(messaging, (payload) => {
          const title = payload.notification?.title || "StudEx";
          const body = payload.notification?.body || "";
          if (reg) reg.showNotification(title, {
            body,
            icon: "/images/logo-1.jpg",
            badge: "/images/logo-1.jpg",
            data: payload.data || {},
          });
        });
      } catch (err) {
        console.warn("[FCM] Silent setup failed:", err);
      }
    };

    const syncToken = async () => {
      if (Notification.permission !== "granted" || !swReg) return;
      try {
        const messaging = await getFirebaseMessaging();
        if (!messaging) return;
        const { getToken } = await import("firebase/messaging");
        const fcmToken = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg });
        if (fcmToken && getAuthToken()) await saveToken(fcmToken);
      } catch {}
    };

    silentSetup();
    window.addEventListener("focus", syncToken);
    return () => {
      window.removeEventListener("focus", syncToken);
      unsubRef.current?.();
      unsubRef.current = null;
    };
  }, [isLoggedIn]);
}
