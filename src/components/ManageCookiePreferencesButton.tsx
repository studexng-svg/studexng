// src/components/ManageCookiePreferencesButton.tsx
"use client";

import { COOKIE_CONSENT_KEY, COOKIE_CONSENT_DATE_KEY, COOKIE_CONSENT_EVENT } from "@/lib/cookieConsent";
import { RotateCcw } from "lucide-react";

/**
 * Clears the stored cookie choice and fires the same event CookieConsent.tsx
 * listens to indirectly via localStorage on next mount — simplest reliable
 * way to re-open the banner is a reload, since CookieConsent's "show after
 * 1.5s if no choice stored" logic only runs on mount.
 */
export default function ManageCookiePreferencesButton() {
  const handleClick = () => {
    localStorage.removeItem(COOKIE_CONSENT_KEY);
    localStorage.removeItem(COOKIE_CONSENT_DATE_KEY);
    window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_EVENT, { detail: null }));
    window.location.reload();
  };

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-2 text-sm font-semibold text-teal-700 hover:text-teal-800 transition"
    >
      <RotateCcw className="w-4 h-4" />
      Manage cookie preferences
    </button>
  );
}
