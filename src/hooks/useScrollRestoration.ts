"use client";
import { useEffect } from "react";

export function useScrollRestoration(
  key: string,
  watchPrefixes: string[],
  ready = true,
) {
  // Save scroll position when navigating to a watched prefix
  useEffect(() => {
    const storageKey = `scroll:${key}`;
    const handleClick = (e: MouseEvent) => {
      const link = (e.target as Element).closest("a");
      const href = link?.getAttribute("href") ?? "";
      if (watchPrefixes.some(p => href.startsWith(p))) {
        sessionStorage.setItem(storageKey, String(window.scrollY));
      }
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Restore scroll only after content is ready (avoids restoring to wrong position
  // when dynamic data hasn't loaded yet and the page is shorter than expected)
  useEffect(() => {
    if (!ready) return;
    const storageKey = `scroll:${key}`;
    const saved = sessionStorage.getItem(storageKey);
    if (!saved) return;
    const y = parseInt(saved, 10);
    sessionStorage.removeItem(storageKey);
    if (y > 0) {
      requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo({ top: y, behavior: "instant" })));
    }
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps
}
