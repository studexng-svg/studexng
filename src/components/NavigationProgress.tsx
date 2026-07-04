"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { TEAL } from "@/lib/tokens";

/**
 * Thin teal bar at the top of the screen that shows whenever the user
 * navigates to another page. Fixes the App Router "silent navigation"
 * problem where nothing happens visually until the new page is ready.
 *
 * Strategy:
 *  - On any <a> click for an internal path → start bar
 *  - When usePathname changes → complete + fade out the bar
 */
export default function NavigationProgress() {
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const [width, setWidth] = useState(0);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  const completionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPath = useRef(pathname);

  const start = () => {
    if (ticker.current) clearInterval(ticker.current);
    setActive(true);
    setWidth(15);
    ticker.current = setInterval(() => {
      setWidth(w => {
        // Slow down as we approach 85% to simulate "waiting"
        const remaining = 85 - w;
        return w + remaining * 0.12;
      });
    }, 200);
  };

  const complete = () => {
    if (ticker.current) clearInterval(ticker.current);
    setWidth(100);
    completionTimer.current = setTimeout(() => {
      setActive(false);
      setWidth(0);
    }, 350);
  };

  // Listen for clicks on internal <a> tags
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("http") || href.startsWith("//") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      // Same page or hash only — no bar needed
      const cleanHref = href.split("?")[0].split("#")[0];
      if (cleanHref === pathname || cleanHref === "" || href.startsWith("#")) return;
      start();
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [pathname]);

  // Complete bar when route actually changes
  useEffect(() => {
    if (pathname !== prevPath.current) {
      prevPath.current = pathname;
      complete();
    }
    return () => {
      if (completionTimer.current) clearTimeout(completionTimer.current);
    };
  }, [pathname]);

  if (!active) return null;

  return (
    <div
      className="fixed top-0 left-0 z-[99999] h-[3px] pointer-events-none"
      style={{
        width: `${width}%`,
        background: TEAL,
        boxShadow: `0 0 10px ${TEAL}80`,
        transition: width === 100
          ? "width 0.25s ease-out, opacity 0.3s"
          : "width 0.2s ease-out",
      }}
    />
  );
}
