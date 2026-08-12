// src/lib/navProgressStore.ts
// Single source of truth for "is anything loading right now" — two
// independent signals feed it:
//   - navActive: a route transition is in flight (NavigationProgress.tsx,
//     the top teal bar — click-to-new-page only, it owns its own
//     start/complete/width-animation timing).
//   - requestCount: how many fetchWithAuth() calls are in flight right now
//     (authStore.ts increments/decrements this around every call) — since
//     every api.* method in src/lib/api.ts goes through fetchWithAuth, this
//     one counter alone covers virtually every data fetch/mutation in the
//     app with no per-call-site wiring needed. A counter, not a boolean,
//     because requests overlap constantly (e.g. a page firing three fetches
//     on mount) — the indicator must stay on until the LAST one finishes,
//     not flicker off when the first one does.
//
// Anything that wants a generic "something is loading" signal (the header
// logo's breathing pulse) reads isLoading() below instead of either raw
// field, so it reacts to both without knowing about the top bar directly.
import { create } from "zustand";

interface NavProgressState {
  navActive: boolean;
  requestCount: number;
  setNavActive: (active: boolean) => void;
  beginRequest: () => void;
  endRequest: () => void;
}

export const useNavProgress = create<NavProgressState>(set => ({
  navActive: false,
  requestCount: 0,
  setNavActive: navActive => set({ navActive }),
  beginRequest: () => set(s => ({ requestCount: s.requestCount + 1 })),
  // Floored at 0 — a request that started before a hot-reload/remount lost
  // its matching endRequest call must never leave the counter permanently
  // negative (which would make isLoading() falsy even while navActive is
  // legitimately true, since -1 || true would still work, but it's a latent
  // footgun otherwise — keep the invariant simple: never below zero).
  endRequest: () => set(s => ({ requestCount: Math.max(0, s.requestCount - 1) })),
}));

/** True while a route transition OR any API request is in flight. */
export const isLoading = (s: NavProgressState) => s.navActive || s.requestCount > 0;
