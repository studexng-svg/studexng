"use client";
import { useEffect } from "react";

export function useScrollRestoration(key: string, watchPrefixes: string[]) {
  useEffect(() => {
    const storageKey = `scroll:${key}`;

    const saved = sessionStorage.getItem(storageKey);
    if (saved) {
      const y = parseInt(saved, 10);
      if (y > 0) {
        requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)));
      }
      sessionStorage.removeItem(storageKey);
    }

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
}
