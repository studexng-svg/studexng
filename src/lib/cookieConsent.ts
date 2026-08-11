// src/lib/cookieConsent.ts
/**
 * Single source of truth for the cookie-consent value CookieConsent.tsx
 * writes and Analytics.tsx reads — before this, "Reject" wrote a localStorage
 * flag nothing ever checked, and Google Analytics (src/app/layout.tsx) loaded
 * unconditionally for every visitor regardless of their choice.
 */

export const COOKIE_CONSENT_KEY = "cookieConsent";
export const COOKIE_CONSENT_DATE_KEY = "cookieConsentDate";
// Fired on the same tab the instant the banner's choice is made, so
// Analytics.tsx can react immediately without waiting for a reload — a
// "storage" event only fires in *other* tabs, never the one that wrote it.
export const COOKIE_CONSENT_EVENT = "studex:cookie-consent-changed";

export type CookieConsentValue = "accepted" | "rejected" | null;

export function getCookieConsent(): CookieConsentValue {
  if (typeof window === "undefined") return null;
  const value = localStorage.getItem(COOKIE_CONSENT_KEY);
  return value === "accepted" || value === "rejected" ? value : null;
}

export function setCookieConsent(value: "accepted" | "rejected") {
  localStorage.setItem(COOKIE_CONSENT_KEY, value);
  localStorage.setItem(COOKIE_CONSENT_DATE_KEY, new Date().toISOString());
  window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_EVENT, { detail: value }));
}
