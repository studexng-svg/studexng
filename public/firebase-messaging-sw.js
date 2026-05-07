importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// NOTE: These values are safe to be here — they are public client-side keys.
// Copy them from your .env.local file (the NEXT_PUBLIC_FIREBASE_* values).
firebase.initializeApp({
  apiKey: "AIzaSyBDElbiP8gSUnfoUa2jrmz_LnF6b7lSKKc",
  authDomain: "studex-37787.firebaseapp.com",
  projectId: "studex-37787",
  storageBucket: "studex-37787.firebasestorage.app",
  messagingSenderId: "1065100834909",
  appId: "1:1065100834909:web:4a74e565934057906a35b4",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || 'StudEx';
  const body = payload.notification?.body || '';
  self.registration.showNotification(title, {
    body,
    icon: '/images/logo-1.jpg',
    badge: '/images/logo-1.jpg',
    data: payload.data || {},
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const actionUrl = event.notification.data?.action_url || '/home';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('studex.com.ng') && 'focus' in client) {
          client.navigate('https://www.studex.com.ng' + actionUrl);
          return client.focus();
        }
      }
      return clients.openWindow('https://www.studex.com.ng' + actionUrl);
    })
  );
});
