import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useAuth } from '@/lib/authStore';

export interface WishlistItem {
  id: number;
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
}

// Returns a user-specific storage key so wishlists never bleed between accounts
const getStorageKey = () => {
  try {
    const userId = useAuth.getState().user?.id;
    return userId ? `studex-wishlist-${userId}` : 'studex-wishlist-guest';
  } catch {
    return 'studex-wishlist-guest';
  }
};

export const useWishlistStore = create<WishlistStore>()(
  persist(
    (set, get) => ({
      wishlist: [],

      addToWishlist: (item) =>
        set((state) => {
          if (state.wishlist.some((w) => w.id === item.id)) return state;
          return { wishlist: [...state.wishlist, item] };
        }),

      removeFromWishlist: (id) =>
        set((state) => ({
          wishlist: state.wishlist.filter((w) => w.id !== id),
        })),

      isInWishlist: (id) => get().wishlist.some((w) => w.id === id),

      clearWishlist: () => set({ wishlist: [] }),
    }),
    {
      name: getStorageKey(),
      storage: createJSONStorage(() => localStorage),
    }
  )
);