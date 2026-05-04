import { create } from 'zustand';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

export interface WishlistItem {
  id: number;       // listing_id
  title: string;
  price: number;
  img: string;
}

interface WishlistStore {
  wishlist: WishlistItem[];
  addToWishlist: (item: WishlistItem) => void;
  removeFromWishlist: (id: number) => void;
  isInWishlist: (id: number) => boolean;
  clearWishlist: () => void;
  fetchWishlist: () => Promise<void>;
  loadWishlistForUser: (userId: number | null) => void;
}

// Dynamic require avoids circular-module issues (authStore ↔ wishlistStore)
const authFetch = (url: string, options: RequestInit = {}) => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { fetchWithAuth } = require('@/lib/authStore');
  return fetchWithAuth(url, options) as Promise<Response>;
};

const userIsLoggedIn = (): boolean => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@/lib/authStore').useAuth.getState().isLoggedIn === true;
  } catch {
    return false;
  }
};

function saveGuestWishlist(wishlist: WishlistItem[]) {
  try {
    localStorage.setItem('studex-wishlist-guest', JSON.stringify(wishlist));
  } catch {}
}

function loadGuestWishlist(): WishlistItem[] {
  try {
    const raw = localStorage.getItem('studex-wishlist-guest');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // Support old Zustand persist shape { state: { wishlist: [] } } and new flat array
    return Array.isArray(parsed) ? parsed : (parsed?.state?.wishlist ?? []);
  } catch {
    return [];
  }
}

export const useWishlistStore = create<WishlistStore>()((set, get) => ({
  wishlist: [],

  addToWishlist: (item) => {
    if (get().wishlist.some((w) => w.id === item.id)) return;

    set((state) => ({ wishlist: [...state.wishlist, item] }));

    if (userIsLoggedIn()) {
      authFetch(`${API_URL}/api/wishlist/add/`, {
        method: 'POST',
        body: JSON.stringify({ listing_id: item.id }),
      }).catch(() => {});
    } else {
      saveGuestWishlist(get().wishlist);
    }
  },

  removeFromWishlist: (id) => {
    set((state) => ({ wishlist: state.wishlist.filter((w) => w.id !== id) }));

    if (userIsLoggedIn()) {
      authFetch(`${API_URL}/api/wishlist/remove/${id}/`, { method: 'DELETE' }).catch(() => {});
    } else {
      saveGuestWishlist(get().wishlist);
    }
  },

  isInWishlist: (id) => get().wishlist.some((w) => w.id === id),

  clearWishlist: () => {
    set({ wishlist: [] });

    if (userIsLoggedIn()) {
      authFetch(`${API_URL}/api/wishlist/clear/`, { method: 'POST' }).catch(() => {});
    } else {
      saveGuestWishlist([]);
    }
  },

  fetchWishlist: async () => {
    try {
      const res = await authFetch(`${API_URL}/api/wishlist/`);
      if (!res.ok) return;
      const data: Array<{
        listing_id: number;
        title: string;
        price: string | number;
        img: string;
      }> = await res.json();
      set({
        wishlist: data.map((item) => ({
          id: item.listing_id,
          title: item.title,
          price: parseFloat(String(item.price)),
          img: item.img || '',
        })),
      });
    } catch {}
  },

  loadWishlistForUser: (userId) => {
    if (userId !== null) {
      // Logged in: backend is source of truth
      get().fetchWishlist();
    } else {
      // Logged out: load guest wishlist from localStorage
      set({ wishlist: loadGuestWishlist() });
    }
  },
}));
