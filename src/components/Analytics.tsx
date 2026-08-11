// src/components/Analytics.tsx
"use client";

import { useEffect } from "react";
import { getCookieConsent, COOKIE_CONSENT_EVENT, type CookieConsentValue } from "@/lib/cookieConsent";

const GA_SCRIPT_ID = "ga4-src";
const GA_INIT_ID = "ga4-init";

/**
 * Loads Google Analytics only after the visitor accepts cookies via
 * CookieConsent.tsx — previously the two GA <Script> tags sat directly in
 * the root layout (a Server Component, no access to localStorage) and fired
 * for every visitor unconditionally, "Reject" or not. This is a client
 * component specifically so it can read that choice before ever injecting
 * anything.
 *
 * Reacts to the studex:cookie-consent-changed event fired by
 * setCookieConsent() so accepting takes effect on this same tab instantly,
 * not just on next page load. There is no un-load path for "Reject" after
 * GA already injected itself in an earlier session on this browser — once
 * a script tag has run there's no clean way to revoke it client-side. That
 * gap only matters for someone who accepted, then later changes their mind
 * within the same browser; a fresh/incognito visit is unaffected either way.
 */
export default function Analytics({ gaId }: { gaId: string }) {
  useEffect(() => {
    const load = (consent: CookieConsentValue) => {
      if (consent !== "accepted") return;
      if (document.getElementById(GA_SCRIPT_ID)) return; // already loaded

      const src = document.createElement("script");
      src.id = GA_SCRIPT_ID;
      src.async = true;
      src.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
      document.head.appendChild(src);

      const init = document.createElement("script");
      init.id = GA_INIT_ID;
      init.innerHTML = `
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', '${gaId}');
      `;
      document.head.appendChild(init);
    };

    load(getCookieConsent());

    const onChange = (e: Event) => load((e as CustomEvent<CookieConsentValue>).detail);
    window.addEventListener(COOKIE_CONSENT_EVENT, onChange);
    return () => window.removeEventListener(COOKIE_CONSENT_EVENT, onChange);
  }, [gaId]);

  return null;
}
