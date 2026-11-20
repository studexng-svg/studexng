// Global network-status signalling.
//
// The browser's `navigator.onLine` only catches a hard "no network interface"
// state. It misses the common real-world case: the device says it's online but
// requests to our API never arrive (dead wifi, captive portal, server
// unreachable). So fetchWithAuth also reports the *outcome* of every request:
// a rejected fetch (TypeError "Failed to fetch") means the server was never
// reached -> offline; any Response at all (even a 500) means the server was
// reached -> online. OfflineBanner listens for these events plus the native
// online/offline events.
//
// We deliberately do NOT treat a slow-but-eventually-successful request as
// offline: the StudEx backend runs on Render and can cold-start for 30s+, and
// flashing "offline" during a legitimately slow load would be worse than
// silence. Only genuine failures trigger the banner.

export const NET_OFFLINE = "studex:net-offline";
export const NET_ONLINE = "studex:net-online";

/** True network error (fetch rejected) vs a deliberate AbortError or anything else. */
export function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true; // browsers throw TypeError for "Failed to fetch"
  if (err && typeof err === "object" && "name" in err) {
    return (err as { name?: string }).name === "TypeError";
  }
  return false;
}

/** A request failed at the network layer — the server was never reached. */
export function reportNetworkFailure(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(NET_OFFLINE));
}

/** A request reached the server (any HTTP status) — we have connectivity. */
export function reportNetworkSuccess(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(NET_ONLINE));
}
