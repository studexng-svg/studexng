// src/lib/firebase.ts
import { initializeApp } from "firebase/app";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence
} from "firebase/auth";
import { getMessaging, isSupported } from "firebase/messaging";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

console.log("Firebase config loaded:", {
  projectId: firebaseConfig.projectId,
  apiKeyPresent: !!firebaseConfig.apiKey,
  authDomain: firebaseConfig.authDomain,
});

if (!firebaseConfig.apiKey) {
  console.error("FIREBASE CONFIG MISSING: Check your .env.local file!");
}

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Force local persistence — this is what keeps users logged in
setPersistence(auth, browserLocalPersistence)
  .then(() => console.log("Firebase persistence set to LOCAL"))
  .catch((err) => console.error("Persistence error:", err));

export const getFirebaseMessaging = async () => {
  const supported = await isSupported();
  if (!supported) return null;
  return getMessaging(app);
};