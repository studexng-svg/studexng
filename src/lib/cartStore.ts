import { create } from "zustand";

export type CartItem = {
  id: number;       // listing_id
  title: string;
  price: number;           // effective (deal-adjusted) price
  original_price?: number; // original listing price (set when a deal is active)
  deal_discount_percent?: number;
  img: string;
  quantity: number;
  category?: string;
  size?: string;
  vendor?: string;
};

type CartStore = {
  cart: CartItem[];
  addToCart: (item: Omit<CartItem, "quantity">) => void;
  removeFromCart: (id: number) => void;
  updateQuantity: (id: number, quantity: number) => void;
  clearCart: () => void;
  fetchCart: () => Promise<void>;
  loadCartForUser: (userId: number | null) => void;
};

// Dynamic require avoids circular-module issues (api → authStore ↔ cartStore)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cartApi = (): typeof import("@/lib/api").api["cart"] => require("@/lib/api").api.cart;

const userIsLoggedIn = (): boolean => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("@/lib/authStore").useAuth.getState().isLoggedIn === true;
  } catch {
    return false;
  }
};

function saveGuestCart(cart: CartItem[]) {
  try {
    localStorage.setItem("studex-cart-guest", JSON.stringify(cart));
  } catch {}
}

function loadGuestCart(): CartItem[] {
  try {
    const raw = localStorage.getItem("studex-cart-guest");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // Support both old Zustand persist shape and new flat array
    return Array.isArray(parsed) ? parsed : (parsed?.state?.cart ?? []);
  } catch {
    return [];
  }
}

export const useCart = create<CartStore>()((set, get) => ({
  cart: [],

  addToCart: (item) => {
    // Optimistic update — instant UI, syncs to backend in background
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
    });

    if (userIsLoggedIn()) {
      cartApi().add({ listing_id: item.id, quantity: 1 }).catch(() => {});
    } else {
      saveGuestCart(get().cart);
    }
  },

  removeFromCart: (id) => {
    set((state) => ({ cart: state.cart.filter((i) => i.id !== id) }));

    if (userIsLoggedIn()) {
      cartApi().remove(id).catch(() => {});
    } else {
      saveGuestCart(get().cart);
    }
  },

  updateQuantity: (id, quantity) => {
    const qty = Math.max(1, quantity);
    set((state) => ({
      cart: state.cart.map((i) => (i.id === id ? { ...i, quantity: qty } : i)),
    }));

    if (userIsLoggedIn()) {
      cartApi().update(id, { quantity: qty }).catch(() => {});
    } else {
      saveGuestCart(get().cart);
    }
  },

  clearCart: () => {
    set({ cart: [] });

    if (userIsLoggedIn()) {
      cartApi().clear().catch(() => {});
    } else {
      saveGuestCart([]);
    }
  },

  fetchCart: async () => {
    try {
      const res = await cartApi().get();
      if (!res.ok) return;
      const data: Array<{
        listing_id: number;
        title: string;
        price: string | number;
        effective_price?: string | number;
        deal_discount_percent?: number;
        img: string;
        quantity: number;
      }> = await res.json();
      set({
        cart: data.map((item) => {
          const originalPrice = parseFloat(String(item.price));
          const effectivePrice = item.effective_price != null
            ? parseFloat(String(item.effective_price))
            : originalPrice;
          const hasDeal = effectivePrice < originalPrice;
          return {
            id: item.listing_id,
            title: item.title,
            price: effectivePrice,
            ...(hasDeal ? { original_price: originalPrice } : {}),
            deal_discount_percent: item.deal_discount_percent ?? 0,
            img: item.img || "",
            quantity: item.quantity,
          };
        }),
      });
    } catch {}
  },

  loadCartForUser: (userId) => {
    if (userId !== null) {
      // Logged in: backend is the source of truth
      get().fetchCart();
    } else {
      // Logged out: load guest cart from localStorage
      set({ cart: loadGuestCart() });
    }
  },
}));

export const useCartStore = useCart;
