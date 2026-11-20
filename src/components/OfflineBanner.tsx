"use client";

import { useEffect, useRef, useState } from "react";
import { WifiOff, Wifi, Loader2 } from "lucide-react";
import { NET_OFFLINE, NET_ONLINE } from "@/lib/networkStatus";

/**
 * LinkedIn-style connectivity banner, shown on every page (including admin).
 *
 * - Goes red "No internet connection" when the device goes offline OR an API
 *   request fails to reach the server.
 * - While offline it probes a same-origin asset every few seconds, so the
 *   banner clears itself the moment the connection is actually back — the user
 *   doesn't have to do anything, and reloading while still offline just shows
 *   the banner again (the probe keeps failing).
 * - Briefly shows a green "Back online" confirmation, then disappears.
 */
export default function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const [reconnected, setReconnected] = useState(false);

  // Mirror `offline` into a ref so the event handlers (registered once) read the
  // current value without needing to re-subscribe on every state change.
  const offlineRef = useRef(false);
  useEffect(() => { offlineRef.current = offline; }, [offline]);

  useEffect(() => {
    const reconnectTimers: ReturnType<typeof setTimeout>[] = [];

    const goOffline = () => {
      if (offlineRef.current) return;
      offlineRef.current = true;
      setOffline(true);
      setReconnected(false);
    };
    const goOnline = () => {
      if (!offlineRef.current) return;
      offlineRef.current = false;
      setOffline(false);
      setReconnected(true);
      reconnectTimers.push(setTimeout(() => setReconnected(false), 2800));
    };

    // Reflect the real state on mount (and on every reload while offline).
    if (typeof navigator !== "undefined" && navigator.onLine === false) goOffline();

    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    window.addEventListener(NET_OFFLINE, goOffline);
    window.addEventListener(NET_ONLINE, goOnline);

    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
      window.removeEventListener(NET_OFFLINE, goOffline);
      window.removeEventListener(NET_ONLINE, goOnline);
      reconnectTimers.forEach(clearTimeout);
    };
  }, []);

  // Self-healing probe: only runs while offline.
  useEffect(() => {
    if (!offline) return;
    let cancelled = false;
    const probe = async () => {
      try {
        // Same-origin asset with a cache-buster. A resolved fetch (any status)
        // means we reached our own site, so connectivity is back.
        await fetch(`/favicon.ico?_net=${Date.now()}`, { cache: "no-store" });
        if (!cancelled) window.dispatchEvent(new Event(NET_ONLINE));
      } catch {
        /* still offline — keep the banner up */
      }
    };
    const id = setInterval(probe, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, [offline]);

  if (!offline && !reconnected) return null;

  return (
    <div
      className="fixed inset-x-0 top-0 z-[100] flex justify-center px-3 pointer-events-none"
      style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
    >
      <div
        role="status"
        aria-live="polite"
        className={`flex items-center gap-2.5 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-lg pointer-events-auto transition-colors ${
          offline ? "bg-red-600" : "bg-emerald-600"
        }`}
      >
        {offline ? (
          <>
            <WifiOff className="w-4 h-4 flex-shrink-0" />
            <span>No internet connection</span>
            <Loader2 className="w-3.5 h-3.5 animate-spin opacity-80 flex-shrink-0" />
          </>
        ) : (
          <>
            <Wifi className="w-4 h-4 flex-shrink-0" />
            <span>Back online</span>
          </>
        )}
      </div>
    </div>
  );
}
