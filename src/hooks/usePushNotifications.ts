// src/hooks/usePushNotifications.ts
// Push notification hook — activate after deploying to HTTPS domain
// Usage: call requestPermission() when user logs in

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

// Replace with your VAPID public key after running:
// py manage.py generate_vapid_keys  (after installing pywebpush)
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export async function requestPushPermission(accessToken: string) {
  // Only works on HTTPS
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
    console.log('[Push] Requires HTTPS — skipping in development');
    return;
  }

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.log('[Push] Not supported in this browser');
    return;
  }

  if (!VAPID_PUBLIC_KEY) {
    console.log('[Push] VAPID key not set — skipping');
    return;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    const registration = await navigator.serviceWorker.register('/sw.js');
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    // Send subscription to backend
    await fetch(`${API_URL}/api/notifications/subscribe/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(subscription),
    });

    console.log('[Push] Subscribed successfully');
  } catch (err) {
    console.log('[Push] Subscription failed:', err);
  }
}