// src/lib/navProgressStore.ts
// Single source of truth for "is a route navigation currently in flight" —
// NavigationProgress.tsx (the top loading bar) writes it, anything else
// that wants to react to the same loading state (the header logo's
// breathing pulse) reads it, without either component needing to know
// about the other directly.
import { create } from "zustand";

interface NavProgressState {
  active: boolean;
  setActive: (active: boolean) => void;
}

export const useNavProgress = create<NavProgressState>(set => ({
  active: false,
  setActive: active => set({ active }),
}));
