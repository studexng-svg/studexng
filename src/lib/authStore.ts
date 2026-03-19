// src/lib/authStore.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

interface UserProfile {
  id: number;
  username: string;
  email: string;
  phone: string;
  user_type: string;
  matric_number?: string | null;
  hostel?: string;
  business_name?: string | null;
  is_verified_vendor: boolean;
  wallet_balance: string;
}

interface AuthState {
  user: UserProfile | null;
  isLoggedIn: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  isHydrated: boolean;
  isAuthReady: boolean;

  login: (userData: UserProfile, accessToken: string, refreshToken: string) => void;
  logout: () => void;
  setUser: (userData: UserProfile) => void;
  updateUser: (freshUser: Partial<UserProfile>) => void;
  setHydrated: (hydrated: boolean) => void;
  setAuthReady: (ready: boolean) => void;
  updateTokens: (accessToken: string, refreshToken: string) => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isLoggedIn: false,
      accessToken: null,
      refreshToken: null,
      isHydrated: false,
      isAuthReady: false,

      login: (userData, accessToken, refreshToken) => {
        set({ user: userData, isLoggedIn: true, accessToken, refreshToken, isAuthReady: true });
        // Load this user's cart from localStorage
        try {
          const { useCart } = require("@/lib/cartStore");
          useCart.getState().loadCartForUser(userData.id);
        } catch {}
      },

      logout: () => {
        try {
          const userId = useAuth.getState().user?.id;
          if (userId) {
            localStorage.removeItem(`studex-wishlist-${userId}`);
          }
          localStorage.removeItem("auth-storage");
          // Clear cart state on logout
          try {
            const { useCart } = require("@/lib/cartStore");
            useCart.getState().loadCartForUser(null);
          } catch {}
        } catch {}
        set({ user: null, isLoggedIn: false, accessToken: null, refreshToken: null, isAuthReady: true });
      },

      setUser: (userData) => set({ user: userData }),

      // Merges fresh fields into existing user — used after /api/auth/me/ call
      // This is how vendor approval by admin gets reflected without re-login
      updateUser: (freshUser) => set((state) => ({
        user: state.user ? { ...state.user, ...freshUser } : state.user,
      })),

      setHydrated: (hydrated) => set({ isHydrated: hydrated }),
      setAuthReady: (ready) => set({ isAuthReady: ready }),
      updateTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({
        user: state.user,
        isLoggedIn: state.isLoggedIn,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) state.setHydrated(true);
      },
    }
  )
);

// ─────────────────────────────────────────
// getToken — reads from Zustand store (in-memory first, then localStorage)
// ─────────────────────────────────────────
export const getToken = (): string | null => {
  try {
    const storeToken = useAuth.getState().accessToken;
    if (storeToken) return storeToken;
    const stored = localStorage.getItem("auth-storage");
    return stored ? JSON.parse(stored)?.state?.accessToken ?? null : null;
  } catch {
    return null;
  }
};

const getRefreshToken = (): string | null => {
  try {
    const storeToken = useAuth.getState().refreshToken;
    if (storeToken) return storeToken;
    const stored = localStorage.getItem("auth-storage");
    return stored ? JSON.parse(stored)?.state?.refreshToken ?? null : null;
  } catch {
    return null;
  }
};

// ─────────────────────────────────────────
// refreshAccessToken — calls Django /api/auth/token/refresh/
// ─────────────────────────────────────────
let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

const refreshAccessToken = async (): Promise<string | null> => {
  if (isRefreshing && refreshPromise) return refreshPromise;

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const refresh = getRefreshToken();
      if (!refresh) return null;

      const res = await fetch(`${API_BASE_URL}/api/auth/token/refresh/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh }),
      });

      if (!res.ok) {
        useAuth.getState().logout();
        return null;
      }

      const data = await res.json();
      const newAccessToken = data.access;
      const newRefreshToken = data.refresh || refresh;

      useAuth.getState().updateTokens(newAccessToken, newRefreshToken);
      return newAccessToken;
    } catch {
      return null;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
};

// ─────────────────────────────────────────
// fetchWithAuth — use instead of fetch() for all authenticated API calls.
// Automatically refreshes expired tokens and retries once.
// ─────────────────────────────────────────
export const fetchWithAuth = async (
  url: string,
  options: RequestInit = {}
): Promise<Response> => {
  const token = getToken();

  const makeRequest = (t: string | null) => {
    const headers = new Headers(options.headers || {});
    if (t) headers.set("Authorization", `Bearer ${t}`);
    if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }
    return fetch(url, { ...options, headers });
  };

  let response = await makeRequest(token);

  if (response.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      response = await makeRequest(newToken);
    }
  }

  return response;
};