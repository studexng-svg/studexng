"use client";

import { useEffect } from "react";
import { getToken } from "firebase/messaging";
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

        const swReg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");

        const fcmToken = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: swReg,
        });

        if (!fcmToken) return;

        const authToken = getAuthToken();
        if (!authToken) return;

        await fetch(`${API_URL}/api/notifications/fcm-token/`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ token: fcmToken }),
        });
      } catch {
        // Silent — push notification failure must never affect the app
      }
    };

    register();
  }, [isLoggedIn]);
}
