// src/lib/authStore.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useNavProgress } from "@/lib/navProgressStore";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

interface UserProfile {
  id: number;
  username: string;
  email: string;
  phone: string;
  user_type: string;
  matric_number?: string | null;
  nin?: string | null;
  hostel?: string;
  business_name?: string | null;
  is_verified_vendor: boolean;
  wallet_balance: string;
  profile_image?: string | null;
  school?: string;
  is_menu_vendor?: boolean;
  catalog_label?: string;
  catalog_item_label?: string;
  catalog_route_slug?: string;
  profile?: {
    vendor_badge?: string;
    rating?: string;
    total_reviews?: number;
    disclaimer_accepted?: boolean;
    [key: string]: unknown;
  };
}

interface AuthState {
  user: UserProfile | null;
  isLoggedIn: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  isHydrated: boolean;
  isAuthReady: boolean;
  walletBalance: string | null;

  login: (userData: UserProfile, accessToken: string, refreshToken: string) => void;
  logout: () => void;
  setUser: (userData: UserProfile) => void;
  updateUser: (freshUser: Partial<UserProfile>) => void;
  setHydrated: (hydrated: boolean) => void;
  setAuthReady: (ready: boolean) => void;
  updateTokens: (accessToken: string, refreshToken: string) => void;
  refreshProfile: () => Promise<void>;
  fetchWalletBalance: () => Promise<void>;
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
      walletBalance: null,

      login: (userData, accessToken, refreshToken) => {
        set({ user: userData, isLoggedIn: true, accessToken, refreshToken, isAuthReady: true });
        // Persist campus to cookie so SSR fetches the right campus on next page load
        if (typeof document !== 'undefined') {
          const school = ((userData as any).school || '').toLowerCase();
          if (school === 'pau' || school === 'futo' || school === 'imsu') {
            const isHttps = window.location.protocol === 'https:';
            const extra = isHttps ? '; Secure; SameSite=Lax' : '; SameSite=Lax';
            document.cookie = `studex_campus=${school}; path=/; max-age=31536000${extra}`;
          }
        }
      },

      logout: () => {
        try {
          localStorage.removeItem("auth-storage");
          // Clear cart and wishlist on logout
          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { useCart } = require("@/lib/cartStore");
            useCart.getState().loadCartForUser(null);
          } catch {}
          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { useWishlistStore } = require("@/lib/wishlistStore");
            useWishlistStore.getState().loadWishlistForUser(null);
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

      refreshProfile: async () => {
        try {
          const res = await fetchWithAuth(`${API_BASE_URL}/api/auth/profile/`);
          if (!res.ok) return;
          const fresh = await res.json();
          set((state) => ({
            user: state.user ? { ...state.user, ...fresh } : state.user,
          }));
        } catch {}
      },

      fetchWalletBalance: async () => {
        try {
          const res = await fetchWithAuth(`${API_BASE_URL}/api/wallet/balance/`);
          if (!res.ok) return;
          const data = await res.json();
          if (data.balance !== undefined) {
            set({ walletBalance: String(data.balance) });
          }
        } catch {}
      },
    }),
    {
      name: "auth-storage",
      // Tokens and wallet balance are intentionally excluded from localStorage.
      // Tokens live in httpOnly cookies; wallet balance must always be fetched fresh.
      partialize: (state) => ({
        user: state.user
          ? (({ wallet_balance, ...rest }) => rest)(state.user as any)
          : null,
        isLoggedIn: state.isLoggedIn,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.setHydrated(true);
        state.setAuthReady(true);
        // On page refresh: re-sync profile, cart, and wishlist from backend
        if (state.isLoggedIn && state.user) {
          setTimeout(async () => {
            // accessToken is null after a refresh (not persisted to localStorage).
            // Restore it from the httpOnly refresh cookie before any authenticated calls,
            // otherwise DRF sees an anonymous request and returns 403 instead of 401.
            await refreshAccessToken();
            useAuth.getState().refreshProfile();
          }, 0);
        }
      },
    }
  )
);

// ─────────────────────────────────────────
// getToken — reads access token from in-memory store.
// Tokens are no longer persisted to localStorage; they live in httpOnly cookies.
// This returns the in-memory copy set after login or cookie-refresh.
// ─────────────────────────────────────────
export const getToken = (): string | null => {
  try {
    return useAuth.getState().accessToken;
  } catch {
    return null;
  }
};

// ─────────────────────────────────────────
// refreshAccessToken — uses the httpOnly refresh_token cookie.
// No token body needed; the cookie is sent automatically.
// ─────────────────────────────────────────
let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

const refreshAccessToken = async (): Promise<string | null> => {
  if (isRefreshing && refreshPromise) return refreshPromise;

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/token/cookie-refresh/`, {
        method: "POST",
        credentials: "include",
      });

      if (!res.ok) {
        useAuth.getState().logout();
        return null;
      }

      const data = await res.json();
      const newAccessToken = data.access;
      const newRefreshToken = data.refresh || null;

      if (newAccessToken) {
        useAuth.getState().updateTokens(newAccessToken, newRefreshToken || "");
      }
      return newAccessToken || null;
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
// Sends httpOnly cookies automatically via credentials:'include'.
// Falls back to Authorization header if in-memory token is available.
// Automatically refreshes via cookie on 401 and retries once.
// ─────────────────────────────────────────
/**
 * Fetches all pages of a paginated DRF list endpoint.
 * Fetches page 1 first to learn the total count, then fires all remaining
 * pages in parallel — turning N sequential round trips into one + parallel.
 */
export const fetchAllPages = async (url: string, maxPages = 20): Promise<any[]> => {
  const firstRes = await fetchWithAuth(url);
  if (!firstRes.ok) return [];
  const firstData = await firstRes.json();

  // Non-paginated endpoint — plain array
  if (Array.isArray(firstData)) return firstData;
  if (!Array.isArray(firstData.results)) return [];

  const all: any[] = [...firstData.results];

  // Single page or no count info — nothing more to fetch
  if (!firstData.next || !firstData.count || all.length === 0) return all;

  const pageSize = all.length;
  const totalPages = Math.min(Math.ceil(firstData.count / pageSize), maxPages);
  if (totalPages <= 1) return all;

  // Build page URLs for pages 2..N
  const pageUrl = (page: number): string => {
    try {
      const u = new URL(url);
      u.searchParams.set('page', String(page));
      return u.toString();
    } catch {
      // Fallback for relative URLs
      const sep = url.includes('?') ? (url.endsWith('&') ? '' : '&') : '?';
      return `${url}${sep}page=${page}`;
    }
  };

  const pageNums = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);

  // Fire all remaining pages simultaneously
  const responses = await Promise.all(pageNums.map(p => fetchWithAuth(pageUrl(p))));
  const pages = await Promise.all(responses.map(r => r.ok ? r.json() : null));

  for (const data of pages) {
    if (data?.results) all.push(...data.results);
  }

  return all;
};

// Every api.* method in src/lib/api.ts funnels through this one function, so
// counting requests here — rather than at each individual call site — is
// what lets navProgressStore's isLoading() react to literally any fetch or
// mutation in the app with zero per-page wiring. beginRequest/endRequest
// wrap the whole logical call, including the 401/403 refresh-and-retry
// below, so the indicator stays on for the full round trip, not just the
// first attempt.
export const fetchWithAuth = async (
  url: string,
  options: RequestInit = {}
): Promise<Response> => {
  const { beginRequest, endRequest } = useNavProgress.getState();
  beginRequest();
  try {
    const token = getToken();

    const makeRequest = (t: string | null) => {
      const headers = new Headers(options.headers || {});
      if (t) headers.set("Authorization", `Bearer ${t}`);
      if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
        headers.set("Content-Type", "application/json");
      }
      return fetch(url, { ...options, headers, credentials: "include" });
    };

    let response = await makeRequest(token);

    if (response.status === 401) {
      const newToken = await refreshAccessToken();
      if (newToken) {
        response = await makeRequest(newToken);
      }
    }

    // DRF returns 403 (not 401) for fully anonymous requests (no Authorization header).
    // This happens on page refresh when accessToken is null but the user is still "logged in"
    // (refresh cookie exists). Attempt a token restore and retry once.
    if (response.status === 403 && !token && useAuth.getState().isLoggedIn) {
      const newToken = await refreshAccessToken();
      if (newToken) {
        response = await makeRequest(newToken);
      }
    }

    return response;
  } finally {
    endRequest();
  }
};
