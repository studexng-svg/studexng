"use client";

import { useEffect } from "react";
import { getToken, onMessage } from "firebase/messaging";
import { useAuth, getToken as getAuthToken } from "@/lib/authStore";
import { getFirebaseMessaging } from "@/lib/firebase";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

export function usePushNotifications() {
  const { isLoggedIn } = useAuth();

  useEffect(() => {
    if (!isLoggedIn || !VAPID_KEY) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;

    const register = async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;

        const messaging = await getFirebaseMessaging();
        if (!messaging) return;

        // Register SW and wait until it is active before asking for a token
        const swReg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
        await navigator.serviceWorker.ready;

        const fcmToken = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: swReg,
        });

        if (!fcmToken) {
          console.warn("[FCM] No token returned — check VAPID key and SW registration");
          return;
        }

        const authToken = getAuthToken();
        if (!authToken) return;

        const res = await fetch(`${API_URL}/api/notifications/fcm-token/`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ token: fcmToken }),
        });

        if (!res.ok) {
          console.warn("[FCM] Token save failed:", res.status);
        }

        // Show notifications while the app is in the foreground too
        onMessage(messaging, (payload) => {
          const title = payload.notification?.title || "StudEx";
          const body = payload.notification?.body || "";
          if (Notification.permission === "granted") {
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
  }, [isLoggedIn]);
}
