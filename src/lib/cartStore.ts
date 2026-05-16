import { create } from "zustand";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export type CartItem = {
  id: number;       // listing_id
  title: string;
  price: number;
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

// Dynamic require avoids circular-module issues (authStore ↔ cartStore)
const authFetch = (url: string, options: RequestInit = {}) => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { fetchWithAuth } = require("@/lib/authStore");
  return fetchWithAuth(url, options) as Promise<Response>;
};

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
      authFetch(`${API_URL}/api/cart/add/`, {
        method: "POST",
        body: JSON.stringify({ listing_id: item.id, quantity: 1 }),
      }).catch(() => {});
    } else {
      saveGuestCart(get().cart);
    }
  },

  removeFromCart: (id) => {
    set((state) => ({ cart: state.cart.filter((i) => i.id !== id) }));

    if (userIsLoggedIn()) {
      authFetch(`${API_URL}/api/cart/remove/${id}/`, { method: "DELETE" }).catch(() => {});
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
      authFetch(`${API_URL}/api/cart/update/${id}/`, {
        method: "PATCH",
        body: JSON.stringify({ quantity: qty }),
      }).catch(() => {});
    } else {
      saveGuestCart(get().cart);
    }
  },

  clearCart: () => {
    set({ cart: [] });

    if (userIsLoggedIn()) {
      authFetch(`${API_URL}/api/cart/clear/`, { method: "POST" }).catch(() => {});
    } else {
      saveGuestCart([]);
    }
  },

  fetchCart: async () => {
    try {
      const res = await authFetch(`${API_URL}/api/cart/`);
      if (!res.ok) return;
      const data: Array<{
        listing_id: number;
        title: string;
        price: string | number;
        img: string;
        quantity: number;
      }> = await res.json();
      set({
        cart: data.map((item) => ({
          id: item.listing_id,
          title: item.title,
          price: parseFloat(String(item.price)),
          img: item.img || "",
          quantity: item.quantity,
        })),
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
