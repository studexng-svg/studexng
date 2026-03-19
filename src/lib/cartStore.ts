// src/lib/cartStore.ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

type CartItem = {
  id: number;
  title: string;
  price: number;
  img: string;
  quantity: number;
};

type CartStore = {
  cart: CartItem[];
  addToCart: (item: Omit<CartItem, "quantity">) => void;
  removeFromCart: (id: number) => void;
  updateQuantity: (id: number, quantity: number) => void;
  clearCart: () => void;
  loadCartForUser: (userId: number | null) => void;
};

export const useCart = create<CartStore>()(
  persist(
    (set) => ({
      cart: [],

      addToCart: (item) =>
        set((state) => {
          const existing = state.cart.find((i) => i.id === item.id);
          if (existing) {
            return {
              cart: state.cart.map((i) =>
                i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
              ),
            };
          }
          return { cart: [...state.cart, { ...item, quantity: 1 }] };
        }),

      removeFromCart: (id) =>
        set((state) => ({
          cart: state.cart.filter((i) => i.id !== id),
        })),

      updateQuantity: (id, quantity) =>
        set((state) => ({
          cart: state.cart.map((i) =>
            i.id === id ? { ...i, quantity: Math.max(1, quantity) } : i
          ),
        })),

      clearCart: () => set({ cart: [] }),

      // Called on login/logout to load the correct user's cart from localStorage
      loadCartForUser: (userId) => {
        try {
          const key = userId ? `studex-cart-${userId}` : "studex-cart-guest";
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            set({ cart: parsed?.state?.cart || [] });
          } else {
            set({ cart: [] });
          }
        } catch {
          set({ cart: [] });
        }
      },
    }),
    {
      name: "studex-cart-guest", // default key — overridden by loadCartForUser on login
      storage: createJSONStorage(() => localStorage),
    }
  )
);

// Save cart to user-specific key whenever cart changes
useCart.subscribe((state) => {
  try {
    const { useAuth } = require("@/lib/authStore");
    const userId = useAuth.getState().user?.id;
    const key = userId ? `studex-cart-${userId}` : "studex-cart-guest";
    localStorage.setItem(key, JSON.stringify({ state: { cart: state.cart }, version: 0 }));
  } catch {}
});

export const useCartStore = useCart;