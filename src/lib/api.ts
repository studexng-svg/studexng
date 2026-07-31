// src/lib/api.ts
// Central HTTP layer — every backend call goes through here.
// Authenticated methods use fetchWithAuth (auto token refresh + cookie support).
// Most methods return Response so each call site handles errors in its own context.

import { fetchWithAuth, fetchAllPages } from "@/lib/authStore";

export const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
export { fetchAllPages };

const BASE = BASE_URL;

/** Build an absolute URL from a backend path. */
const u = (path: string) => `${BASE}${path}`;

/** JSON.stringify shorthand. fetchWithAuth auto-sets Content-Type when body is a string. */
const s = (body: unknown) => JSON.stringify(body);

// ─── Types (used by auth/page.tsx) ───────────────────────────────────────────

export interface RegisterData {
  username: string;
  email: string;
  phone: string;
  password: string;
  password2: string;
  user_type: string;
  hostel: string;
  school: string;
  matric_number?: string;
  campus?: string;
  business_name?: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface UserProfile {
  id: number;
  username: string;
  email: string;
  phone: string;
  user_type: string;
  school?: string;
  matric_number?: string;
  hostel?: string;
  business_name?: string;
  is_verified_vendor: boolean;
  is_menu_vendor?: boolean;
  catalog_label?: string;
  catalog_item_label?: string;
  catalog_route_slug?: string;
  bio?: string;
  profile_image?: string;
  wallet_balance: string;
  created_at: string;
  profile: {
    whatsapp?: string;
    instagram?: string;
    total_orders: number;
    total_sales: number;
    rating: string;
    total_reviews: number;
  };
}

export interface AuthResponse {
  message: string;
  user: UserProfile;
  tokens: {
    refresh: string;
    access: string;
  };
}

// ─── Error parsing for register/login (throws on non-ok) ─────────────────────

async function parseOrThrow(response: Response): Promise<any> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    let msg =
      data.error ||
      data.detail ||
      data.message ||
      (data.non_field_errors && data.non_field_errors[0]);
    if (!msg) {
      const reserved = ["error", "detail", "message", "non_field_errors", "status_code"];
      const fieldErrors = Object.entries(data)
        .filter(([key]) => !reserved.includes(key))
        .map(([field, errs]) => {
          const errText = Array.isArray(errs) ? errs[0] : String(errs);
          const label =
            field.charAt(0).toUpperCase() + field.slice(1).replace(/_/g, " ");
          return `${label}: ${errText}`;
        });
      msg = fieldErrors.length > 0 ? fieldErrors.join(" • ") : "Request failed";
    }
    const err: any = new Error(msg);
    err.disabled = data.disabled || false;
    err.status = response.status;
    err.fieldErrors = data;
    throw err;
  }
  return data;
}

export const api = {
  // ─── register / login / forgotPassword ───────────────────────────────────
  // These three return parsed JSON and throw on error (used by auth/page.tsx).

  async register(data: RegisterData): Promise<AuthResponse> {
    const res = await fetch(u("/api/auth/register/"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: s(data),
      credentials: "include",
    });
    return parseOrThrow(res);
  },

  async login(data: LoginData): Promise<AuthResponse> {
    const res = await fetch(u("/api/auth/login/"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: s(data),
      credentials: "include",
    });
    return parseOrThrow(res);
  },

  async forgotPassword(email: string): Promise<{ detail: string }> {
    const res = await fetch("/api/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: s({ email }),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.detail || "Failed to send reset link");
    }
    return res.json();
  },

  // ─── Public (no auth required) ───────────────────────────────────────────

  pub: {
    checkUsername: (username: string, signal?: AbortSignal) =>
      fetch(u(`/api/auth/check-username/?username=${encodeURIComponent(username)}`), signal ? { signal } : {}),

    sendOtp: (email: string) =>
      fetch(u("/api/auth/send-otp/"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: s({ email }),
      }),

    verifyOtp: (email: string, otp: string) =>
      fetch(u("/api/auth/verify-otp/"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: s({ email, otp }),
      }),

    vendor: (username: string) => fetch(u(`/api/auth/vendors/${username}/`)),

    vendors: (params?: Record<string, string>) => {
      const qs = params ? "?" + new URLSearchParams(params) : "";
      return fetch(u(`/api/auth/vendors/${qs}`));
    },

    listing: (id: number | string) => fetch(u(`/api/services/listings/${id}/`)),

    listings: (params?: Record<string, string>) => {
      const qs = params ? "?" + new URLSearchParams(params) : "";
      return fetch(u(`/api/services/listings/${qs}`));
    },

    categories: (params?: Record<string, string>) => {
      const qs = params ? "?" + new URLSearchParams(params) : "";
      return fetch(u(`/api/services/categories/${qs}`));
    },

    deals: (campus?: string) =>
      fetch(u(`/api/services/deals/${campus ? "?campus=" + campus : ""}`)),

    heroSlides: () => fetch(u("/api/services/hero-slides/")),

    reviews: (params?: Record<string, string>) => {
      const qs = params ? "?" + new URLSearchParams(params) : "";
      return fetch(u(`/api/reviews/reviews/${qs}`));
    },

    paystackBanks: () =>
      fetch("https://api.paystack.co/bank?country=nigeria&perPage=200&use_cursor=false"),
  },

  // ─── Auth (authenticated) ─────────────────────────────────────────────────

  auth: {
    me: () => fetchWithAuth(u("/api/auth/me/")),

    profile: () => fetchWithAuth(u("/api/auth/profile/")),

    updateProfile: (body: FormData | Record<string, unknown>) =>
      fetchWithAuth(u("/api/auth/profile/update/"), {
        method: "PATCH",
        body: body instanceof FormData ? body : s(body),
      }),

    checkCompletion: () =>
      fetchWithAuth(u("/api/auth/profile/check-completion/"), { method: "POST" }),

    logout: () => fetchWithAuth(u("/api/auth/logout/"), { method: "POST" }),

    heartbeat: () => fetchWithAuth(u("/api/auth/heartbeat/"), { method: "POST" }),

    changePassword: (body: Record<string, string>) =>
      fetchWithAuth(u("/api/auth/change-password/"), { method: "POST", body: s(body) }),

    applyVendor: (formData: FormData) =>
      fetchWithAuth(u("/api/auth/seller/applications/"), { method: "POST", body: formData }),

    sellerApplication: (id: number | string) =>
      fetchWithAuth(u(`/api/auth/seller/applications/${id}/`)),

    sellerApplicationAction: (
      id: number | string,
      action: string,
      body?: Record<string, unknown>
    ) =>
      fetchWithAuth(u(`/api/auth/seller/applications/${id}/${action}/`), {
        method: "POST",
        body: body ? s(body) : undefined,
      }),
  },

  // ─── Services / Listings ──────────────────────────────────────────────────

  services: {
    listingsAuth: (params?: Record<string, string>) => {
      const qs = params ? "?" + new URLSearchParams(params) : "";
      return fetchWithAuth(u(`/api/services/listings/${qs}`));
    },

    categoriesAuth: () => fetchWithAuth(u("/api/services/categories/")),

    createListing: (fd: FormData) =>
      fetchWithAuth(u("/api/services/listings/"), { method: "POST", body: fd }),

    updateListing: (id: number | string, fd: FormData) =>
      fetchWithAuth(u(`/api/services/listings/${id}/`), { method: "PATCH", body: fd }),

    deleteListing: (id: number | string) =>
      fetchWithAuth(u(`/api/services/listings/${id}/`), { method: "DELETE" }),

    previewPrice: (payoutAmount: string | number) =>
      fetchWithAuth(u("/api/services/preview-price/"), { method: "POST", body: s({ payout_amount: payoutAmount }) }),

    adminToggle: (id: number | string, body: Record<string, unknown>) =>
      fetchWithAuth(u(`/api/admin/listings/${id}/`), { method: "PATCH", body: s(body) }),

    adminDelete: (id: number | string) =>
      fetchWithAuth(u(`/api/admin/listings/${id}/`), { method: "DELETE" }),

    // ── Menu management (Phase 1 Step 2 / Phase 2 integration) ──────────────
    menuCategories: () => fetchWithAuth(u("/api/services/menu-categories/")),
    createMenuCategory: (body: Record<string, unknown>) =>
      fetchWithAuth(u("/api/services/menu-categories/"), { method: "POST", body: s(body) }),
    updateMenuCategory: (id: number | string, body: Record<string, unknown>) =>
      fetchWithAuth(u(`/api/services/menu-categories/${id}/`), { method: "PATCH", body: s(body) }),
    deleteMenuCategory: (id: number | string) =>
      fetchWithAuth(u(`/api/services/menu-categories/${id}/`), { method: "DELETE" }),
    reorderMenuCategories: (items: { id: number; display_order: number }[]) =>
      fetchWithAuth(u("/api/services/menu-categories/reorder/"), { method: "POST", body: s({ items }) }),

    menuItems: () => fetchWithAuth(u("/api/services/menu-items/")),
    createMenuItem: (body: Record<string, unknown>) =>
      fetchWithAuth(u("/api/services/menu-items/"), { method: "POST", body: s(body) }),
    updateMenuItem: (id: number | string, body: Record<string, unknown>) =>
      fetchWithAuth(u(`/api/services/menu-items/${id}/`), { method: "PATCH", body: s(body) }),
    deleteMenuItem: (id: number | string) =>
      fetchWithAuth(u(`/api/services/menu-items/${id}/`), { method: "DELETE" }),

    addonGroups: () => fetchWithAuth(u("/api/services/addon-groups/")),
    createAddonGroup: (body: Record<string, unknown>) =>
      fetchWithAuth(u("/api/services/addon-groups/"), { method: "POST", body: s(body) }),
    updateAddonGroup: (id: number | string, body: Record<string, unknown>) =>
      fetchWithAuth(u(`/api/services/addon-groups/${id}/`), { method: "PATCH", body: s(body) }),
    deleteAddonGroup: (id: number | string) =>
      fetchWithAuth(u(`/api/services/addon-groups/${id}/`), { method: "DELETE" }),

    addons: () => fetchWithAuth(u("/api/services/addons/")),
    createAddon: (body: Record<string, unknown>) =>
      fetchWithAuth(u("/api/services/addons/"), { method: "POST", body: s(body) }),
    updateAddon: (id: number | string, body: Record<string, unknown>) =>
      fetchWithAuth(u(`/api/services/addons/${id}/`), { method: "PATCH", body: s(body) }),
    deleteAddon: (id: number | string) =>
      fetchWithAuth(u(`/api/services/addons/${id}/`), { method: "DELETE" }),
  },

  // ─── Orders ───────────────────────────────────────────────────────────────

  orders: {
    list: (role?: "buyer" | "seller") =>
      fetchWithAuth(u(`/api/orders/orders/${role ? "?role=" + role : ""}`)),

    get: (id: number | string) => fetchWithAuth(u(`/api/orders/orders/${id}/`)),

    confirm: (id: number | string) =>
      fetchWithAuth(u(`/api/orders/orders/${id}/confirm/`), { method: "POST" }),

    tracking: (id: number | string) =>
      fetchWithAuth(u(`/api/orders/orders/${id}/tracking/`)),

    vendorAccept: (id: number | string) =>
      fetchWithAuth(u(`/api/orders/orders/${id}/vendor-accept/`), { method: "POST" }),

    vendorDecline: (id: number | string) =>
      fetchWithAuth(u(`/api/orders/orders/${id}/vendor-decline/`), { method: "POST" }),

    startService: (id: number | string) =>
      fetchWithAuth(u(`/api/orders/orders/${id}/start-service/`), { method: "POST" }),

    markComplete: (id: number | string, body?: FormData | Record<string, unknown>) =>
      fetchWithAuth(u(`/api/orders/orders/${id}/mark-complete/`), {
        method: "PATCH",
        body: body instanceof FormData ? body : body ? s(body) : undefined,
      }),

    markItemUnavailable: (orderId: number | string, itemId: number | string) =>
      fetchWithAuth(u(`/api/orders/orders/${orderId}/items/${itemId}/mark-unavailable/`), { method: "POST" }),

    bookings: () => fetchWithAuth(u("/api/orders/bookings/")),

    createBooking: (body: FormData | Record<string, unknown>) =>
      fetchWithAuth(u("/api/orders/bookings/"), {
        method: "POST",
        body: body instanceof FormData ? body : s(body),
      }),

    bookingAction: (id: number | string, action: string) =>
      fetchWithAuth(u(`/api/orders/bookings/${id}/${action}/`), { method: "POST" }),

    createDispute: (body: FormData | Record<string, unknown>) =>
      fetchWithAuth(u("/api/orders/disputes/"), {
        method: "POST",
        body: body instanceof FormData ? body : s(body),
      }),

    disputes: () => fetchWithAuth(u("/api/orders/disputes/")),

    respondToDispute: (id: number | string, response: string) =>
      fetchWithAuth(u(`/api/orders/disputes/${id}/respond/`), {
        method: "POST",
        body: s({ provider_response: response }),
      }),
  },

  // ─── Vendor Customers ─────────────────────────────────────────────────────

  customers: {
    list: (sort?: "total_spent" | "last_purchase") =>
      fetchWithAuth(u(`/api/vendor/customers/${sort ? "?sort=" + sort : ""}`)),

    detail: (customerId: number | string) =>
      fetchWithAuth(u(`/api/vendor/customers/${customerId}/`)),
  },

  // ─── Payments ─────────────────────────────────────────────────────────────

  payments: {
    initialize: (body: Record<string, unknown>) =>
      fetchWithAuth(u("/api/payments/initialize/"), { method: "POST", body: s(body) }),

    verify: (body: Record<string, unknown>) =>
      fetchWithAuth(u("/api/payments/verify/"), { method: "POST", body: s(body) }),

    checkStatus: (txRef: string) =>
      fetchWithAuth(u(`/api/payments/check-status/?tx_ref=${encodeURIComponent(txRef)}`)),

    previewPrice: (body: Record<string, unknown>) =>
      fetchWithAuth(u("/api/payments/preview-price/"), { method: "POST", body: s(body) }),

    previewAddonPrice: (body: Record<string, unknown>) =>
      fetchWithAuth(u("/api/payments/preview-addon-price/"), { method: "POST", body: s(body) }),

    payWithCredits: (body: Record<string, unknown>) =>
      fetchWithAuth(u("/api/payments/pay-with-credits/"), { method: "POST", body: s(body) }),

    bankAccount: () => fetchWithAuth(u("/api/payments/seller/bank-account/")),

    saveBankAccount: (body: Record<string, unknown>) =>
      fetchWithAuth(u("/api/payments/seller/bank-account/"), { method: "POST", body: s(body) }),

    verifyBankAccount: (body: Record<string, unknown>) =>
      fetchWithAuth(u("/api/payments/verify-bank-account/"), { method: "POST", body: s(body) }),

    earnings: () => fetchWithAuth(u("/api/payments/seller/earnings/")),

    transactions: () => fetchWithAuth(u("/api/payments/seller/transactions/")),

    // ── Vendor-scoped cart checkout (Phase 1 Step 3/4 / Phase 2 integration) ──
    initializeCart: (body: Record<string, unknown>) =>
      fetchWithAuth(u("/api/payments/initialize-cart/"), { method: "POST", body: s(body) }),

    verifyCart: (body: Record<string, unknown>) =>
      fetchWithAuth(u("/api/payments/verify-cart/"), { method: "POST", body: s(body) }),

    // ── Temporary manual bank-transfer settlement (menu vendors only) ──
    bankTransferDetails: () => fetchWithAuth(u("/api/payments/bank-transfer-details/")),

    bankTransferCart: (body: Record<string, unknown>) =>
      fetchWithAuth(u("/api/payments/bank-transfer-cart/"), { method: "POST", body: s(body) }),

    manualRefund: (id: number | string) => fetchWithAuth(u(`/api/payments/manual-refunds/${id}/`)),

    submitManualRefundBankDetails: (id: number | string, body: Record<string, unknown>) =>
      fetchWithAuth(u(`/api/payments/manual-refunds/${id}/`), { method: "POST", body: s(body) }),
  },

  // ─── Cart ─────────────────────────────────────────────────────────────────

  cart: {
    get: () => fetchWithAuth(u("/api/cart/")),

    add: (body: Record<string, unknown>) =>
      fetchWithAuth(u("/api/cart/add/"), { method: "POST", body: s(body) }),

    remove: (id: number | string) =>
      fetchWithAuth(u(`/api/cart/remove/${id}/`), { method: "DELETE" }),

    update: (id: number | string, body: Record<string, unknown>) =>
      fetchWithAuth(u(`/api/cart/update/${id}/`), { method: "PATCH", body: s(body) }),

    clear: () => fetchWithAuth(u("/api/cart/clear/"), { method: "POST" }),

    // ── Per-line (by CartItem id) actions — needed once a listing can have
    // several add-on-distinct cart lines (Phase 1 Step 3 / Phase 2 integration) ──
    updateItem: (cartItemId: number | string, body: Record<string, unknown>) =>
      fetchWithAuth(u(`/api/cart/items/${cartItemId}/update/`), { method: "PATCH", body: s(body) }),

    removeItem: (cartItemId: number | string) =>
      fetchWithAuth(u(`/api/cart/items/${cartItemId}/remove/`), { method: "DELETE" }),
  },

  // ─── Wishlist ─────────────────────────────────────────────────────────────

  wishlist: {
    get: () => fetchWithAuth(u("/api/wishlist/")),

    add: (body: Record<string, unknown>) =>
      fetchWithAuth(u("/api/wishlist/add/"), { method: "POST", body: s(body) }),

    remove: (id: number | string) =>
      fetchWithAuth(u(`/api/wishlist/remove/${id}/`), { method: "DELETE" }),

    clear: () => fetchWithAuth(u("/api/wishlist/clear/"), { method: "POST" }),
  },

  // ─── Chat ─────────────────────────────────────────────────────────────────

  chat: {
    conversations: () => fetchWithAuth(u("/api/chat/conversations/")),

    conversation: (id: number | string) =>
      fetchWithAuth(u(`/api/chat/conversations/${id}/`)),

    deleteConversation: (id: number | string) =>
      fetchWithAuth(u(`/api/chat/conversations/${id}/`), { method: "DELETE" }),

    start: (body: Record<string, unknown>) =>
      fetchWithAuth(u("/api/chat/conversations/"), { method: "POST", body: s(body) }),

    forBooking: (bookingId: number | string) =>
      fetchWithAuth(u("/api/chat/conversations/for-booking/"), { method: "POST", body: s({ booking_id: bookingId }) }),

    forOrder: (orderId: number | string) =>
      fetchWithAuth(u("/api/chat/conversations/for-order/"), { method: "POST", body: s({ order_id: orderId }) }),

    sendTyping: (id: number | string) =>
      fetchWithAuth(u(`/api/chat/conversations/${id}/typing/`), { method: "POST" }),

    typingStatus: (id: number | string) =>
      fetchWithAuth(u(`/api/chat/conversations/${id}/typing/`)),

    messages: (id: number | string) =>
      fetchWithAuth(u(`/api/chat/conversations/${id}/messages/`)),

    pinned: (id: number | string) =>
      fetchWithAuth(u(`/api/chat/conversations/${id}/pinned/`)),

    send: (id: number | string, body: Record<string, unknown>) =>
      fetchWithAuth(u(`/api/chat/conversations/${id}/send/`), {
        method: "POST",
        body: s(body),
      }),

    sendImage: (id: number | string, formData: FormData) =>
      fetchWithAuth(u(`/api/chat/conversations/${id}/send/`), {
        method: "POST",
        body: formData,
      }),

    deleteForMe: (msgId: number | string) =>
      fetchWithAuth(u(`/api/chat/messages/${msgId}/delete_for_me/`), { method: "POST" }),

    deleteForEveryone: (msgId: number | string) =>
      fetchWithAuth(u(`/api/chat/messages/${msgId}/delete_for_everyone/`), { method: "POST" }),

    editMessage: (msgId: number | string, body: Record<string, unknown>) =>
      fetchWithAuth(u(`/api/chat/messages/${msgId}/edit_message/`), {
        method: "PATCH",
        body: s(body),
      }),

    pinMessage: (msgId: number | string) =>
      fetchWithAuth(u(`/api/chat/messages/${msgId}/pin_message/`), { method: "POST" }),
  },

  // ─── Notifications ────────────────────────────────────────────────────────

  notifications: {
    list: () => fetchWithAuth(u("/api/notifications/")),

    status: () => fetchWithAuth(u("/api/notifications/status/")),

    markRead: (id: number | string) =>
      fetchWithAuth(u(`/api/notifications/${id}/read/`), { method: "POST" }),

    markAllRead: () =>
      fetchWithAuth(u("/api/notifications/read-all/"), { method: "POST" }),

    delete: (id: number | string) =>
      fetchWithAuth(u(`/api/notifications/${id}/delete/`), { method: "DELETE" }),

    registerToken: (token: string) =>
      fetchWithAuth(u("/api/notifications/fcm-token/"), {
        method: "POST",
        body: s({ token }),
      }),
  },

  // ─── Loyalty ──────────────────────────────────────────────────────────────

  loyalty: {
    status: () => fetchWithAuth(u("/api/loyalty/status/")),
  },

  // ─── Reviews ──────────────────────────────────────────────────────────────

  reviews: {
    canReview: (orderId: number | string) =>
      fetchWithAuth(u(`/api/reviews/reviews/can-review/${orderId}/`)),

    submit: (body: Record<string, unknown>) =>
      fetchWithAuth(u("/api/reviews/reviews/"), { method: "POST", body: s(body) }),

    submitFeedback: (body: Record<string, unknown>) =>
      fetchWithAuth(u("/api/reviews/submit-app-feedback/"), {
        method: "POST",
        body: s(body),
      }),
  },

  // ─── Admin ────────────────────────────────────────────────────────────────

  admin: {
    dashboard: () => fetchWithAuth(u("/api/admin/dashboard/")),

    activity: () => fetchWithAuth(u("/api/admin/activity/")),

    analytics: (days: number) =>
      fetchWithAuth(u(`/api/admin/analytics/timeseries/?days=${days}`)),

    // Listings
    listing: (id: number | string) => fetchWithAuth(u(`/api/admin/listings/${id}/`)),

    updateListing: (id: number | string, body: Record<string, unknown>) =>
      fetchWithAuth(u(`/api/admin/listings/${id}/`), { method: "PATCH", body: s(body) }),

    deleteListing: (id: number | string) =>
      fetchWithAuth(u(`/api/admin/listings/${id}/`), { method: "DELETE" }),

    searchListings: (query: string) =>
      fetchWithAuth(u(`/api/admin/listings/?search=${encodeURIComponent(query)}&page_size=8`)),

    bulkUpdateCategory: (body: Record<string, unknown>) =>
      fetchWithAuth(u("/api/admin/listings/bulk-update-category/"), {
        method: "PATCH",
        body: s(body),
      }),

    // Categories
    categories: () => fetchWithAuth(u("/api/admin/categories/")),

    createCategory: (body: Record<string, unknown>) =>
      fetchWithAuth(u("/api/admin/categories/"), { method: "POST", body: s(body) }),

    updateCategory: (id: number | string, body: Record<string, unknown>) =>
      fetchWithAuth(u(`/api/admin/categories/${id}/`), { method: "PATCH", body: s(body) }),

    deleteCategory: (id: number | string) =>
      fetchWithAuth(u(`/api/admin/categories/${id}/`), { method: "DELETE" }),

    // Orders
    order: (id: number | string) => fetchWithAuth(u(`/api/admin/orders/${id}/`)),

    updateOrder: (id: number | string, body: Record<string, unknown>) =>
      fetchWithAuth(u(`/api/admin/orders/${id}/`), { method: "PATCH", body: s(body) }),

    // Payments & transactions
    payment: (id: number | string) => fetchWithAuth(u(`/api/admin/payments/${id}/`)),

    updateServiceTransaction: (id: number | string, body: Record<string, unknown>) =>
      fetchWithAuth(u(`/api/admin/service-transactions/${id}/`), {
        method: "PATCH",
        body: s(body),
      }),

    // Platform earnings & vendor payouts
    platformEarnings: (search?: string) =>
      fetchWithAuth(
        u(`/api/admin/platform-earnings/${search ? "?search=" + encodeURIComponent(search) : ""}`)
      ),

    vendorPayouts: (params?: { search?: string; campus?: string }) => {
      const qs = new URLSearchParams();
      if (params?.search) qs.set("search", params.search);
      if (params?.campus) qs.set("campus", params.campus);
      const q = qs.toString();
      return fetchWithAuth(u(`/api/admin/vendor-payouts/${q ? "?" + q : ""}`));
    },

    // Deals
    deals: () => fetchWithAuth(u("/api/admin/deals/")),

    createDeal: (body: Record<string, unknown>) =>
      fetchWithAuth(u("/api/admin/deals/"), { method: "POST", body: s(body) }),

    updateDeal: (id: number | string, body: Record<string, unknown>) =>
      fetchWithAuth(u(`/api/admin/deals/${id}/`), { method: "PATCH", body: s(body) }),

    deleteDeal: (id: number | string) =>
      fetchWithAuth(u(`/api/admin/deals/${id}/`), { method: "DELETE" }),

    // Disputes
    dispute: (id: number | string) => fetchWithAuth(u(`/api/admin/disputes/${id}/`)),

    updateDispute: (id: number | string, body: Record<string, unknown>) =>
      fetchWithAuth(u(`/api/admin/disputes/${id}/`), { method: "PATCH", body: s(body) }),

    // Reviews
    deleteReview: (id: number | string) =>
      fetchWithAuth(u(`/api/admin/reviews/${id}/`), { method: "DELETE" }),

    // Bank accounts
    updateBankAccount: (id: number | string, body: Record<string, unknown>) =>
      fetchWithAuth(u(`/api/admin/bank-accounts/${id}/`), { method: "PATCH", body: s(body) }),

    // Messaging & broadcast
    broadcastCounts: (qs: string) =>
      fetchWithAuth(u(`/api/admin/broadcast-counts/${qs}`)),

    broadcastPreview: (body: Record<string, unknown>) =>
      fetchWithAuth(u("/api/admin/broadcast-preview/"), { method: "POST", body: s(body) }),

    notifyAll: (body: Record<string, unknown>) =>
      fetchWithAuth(u("/api/admin/notify-all/"), { method: "POST", body: s(body) }),

    // AI history & chat
    aiHistory: () => fetchWithAuth(u("/api/admin/ai-history/")),

    saveAiHistory: (body: Record<string, unknown>) =>
      fetchWithAuth(u("/api/admin/ai-history/"), { method: "POST", body: s(body) }),

    aiSession: (id: number | string) => fetchWithAuth(u(`/api/admin/ai-history/${id}/`)),

    deleteAiSession: (id: number | string) =>
      fetchWithAuth(u(`/api/admin/ai-history/${id}/`), { method: "DELETE" }),

    aiChat: (body: Record<string, unknown>) =>
      fetchWithAuth(u("/api/admin/ai-chat/"), { method: "POST", body: s(body) }),

    aiAction: (body: Record<string, unknown>) =>
      fetchWithAuth(u("/api/admin/ai-action/"), { method: "POST", body: s(body) }),

    // Groq AI broadcast
    groqLogs: () => fetchWithAuth(u("/api/admin/groq-notify/")),

    groqNotify: (body: Record<string, unknown>) =>
      fetchWithAuth(u("/api/admin/groq-notify/"), { method: "POST", body: s(body) }),

    // Platform settings
    platformSettings: () => fetchWithAuth(u("/api/admin/platform-settings/")),

    updatePlatformSettings: (body: Record<string, unknown>) =>
      fetchWithAuth(u("/api/admin/platform-settings/"), { method: "PATCH", body: s(body) }),

    // Rewards
    rewardsOverview: () => fetchWithAuth(u("/api/admin/rewards-overview/")),

    // Conversations
    conversation: (id: number | string) => fetchWithAuth(u(`/api/admin/conversations/${id}/`)),

    // Seller approvals
    sellerApprovals: (school?: string) =>
      fetchWithAuth(u(`/api/auth/seller/applications/${school ? "?school=" + school : ""}`)),

    sellerApplication: (id: number | string) =>
      fetchWithAuth(u(`/api/auth/seller/applications/${id}/`)),

    approveApplication: (
      id: number | string,
      action: string,
      body?: Record<string, unknown>
    ) =>
      fetchWithAuth(u(`/api/auth/seller/applications/${id}/${action}/`), {
        method: "POST",
        body: body ? s(body) : undefined,
      }),

    // Vendor of month
    vendorOfMonth: (campus: string) => fetchWithAuth(u(`/api/admin/vendor-of-month/?campus=${campus}`)),

    setVendorOfMonth: (body: Record<string, unknown>) =>
      fetchWithAuth(u("/api/admin/vendor-of-month/"), { method: "POST", body: s(body) }),

    updateVendorOfMonth: (body: Record<string, unknown>) =>
      fetchWithAuth(u("/api/admin/vendor-of-month/"), { method: "PATCH", body: s(body) }),

    deleteVendorOfMonth: (campus: string) =>
      fetchWithAuth(u(`/api/admin/vendor-of-month/?campus=${campus}`), { method: "DELETE" }),

    // Users
    user: (id: number | string) => fetchWithAuth(u(`/api/admin/users/${id}/`)),

    updateUser: (id: number | string, body: Record<string, unknown>) =>
      fetchWithAuth(u(`/api/admin/users/${id}/`), { method: "PATCH", body: s(body) }),

    notifyUser: (id: number | string, body: Record<string, unknown>) =>
      fetchWithAuth(u(`/api/admin/users/${id}/notify/`), { method: "POST", body: s(body) }),

    makeRider: (id: number | string) =>
      fetchWithAuth(u(`/api/admin/users/${id}/make-rider/`), { method: "POST" }),

    removeRider: (id: number | string) =>
      fetchWithAuth(u(`/api/admin/users/${id}/make-rider/`), { method: "DELETE" }),

    riders: () => fetchWithAuth(u("/api/admin/riders/")),

    // Pickup points
    pickupPoints: (campus?: string) =>
      fetchWithAuth(u(`/api/admin/pickup-points/${campus ? "?campus=" + campus : ""}`)),

    createPickupPoint: (body: Record<string, unknown>) =>
      fetchWithAuth(u("/api/admin/pickup-points/"), { method: "POST", body: s(body) }),

    updatePickupPoint: (id: number | string, body: Record<string, unknown>) =>
      fetchWithAuth(u(`/api/admin/pickup-points/${id}/`), { method: "PATCH", body: s(body) }),

    deletePickupPoint: (id: number | string) =>
      fetchWithAuth(u(`/api/admin/pickup-points/${id}/`), { method: "DELETE" }),

    assignRider: (orderId: number | string, body: Record<string, unknown>) =>
      fetchWithAuth(u(`/api/admin/orders/${orderId}/assign-rider/`), { method: "POST", body: s(body) }),

    deliveries: (statusFilter?: string) =>
      fetchWithAuth(u(`/api/admin/deliveries/${statusFilter ? "?status=" + statusFilter : ""}`)),

    searchUsers: (search: string, userType?: string) =>
      fetchWithAuth(
        u(
          `/api/admin/users/?search=${encodeURIComponent(search)}${
            userType ? "&user_type=" + userType : ""
          }`
        )
      ),

    abandonedCarts: (campus?: string) =>
      fetchWithAuth(u(`/api/admin/abandoned-carts/${campus ? "?campus=" + campus : ""}`)),

    sendAbandonedCartReminder: (userIds: number[]) =>
      fetchWithAuth(u("/api/admin/abandoned-carts/remind/"), {
        method: "POST",
        body: s({ user_ids: userIds }),
      }),

    // ── Delivery slots (Phase 2 simplification — one CRUD surface, was batch-templates + delivery-batches) ──
    deliverySlots: (vendorId?: number | string) =>
      fetchWithAuth(u(`/api/admin/delivery-slots/${vendorId ? "?vendor_id=" + vendorId : ""}`)),

    createDeliverySlot: (body: Record<string, unknown>) =>
      fetchWithAuth(u("/api/admin/delivery-slots/"), { method: "POST", body: s(body) }),

    updateDeliverySlot: (id: number | string, body: Record<string, unknown>) =>
      fetchWithAuth(u(`/api/admin/delivery-slots/${id}/`), { method: "PATCH", body: s(body) }),

    deleteDeliverySlot: (id: number | string) =>
      fetchWithAuth(u(`/api/admin/delivery-slots/${id}/`), { method: "DELETE" }),
  },

  delivery: {
    pickupPoints: (campus?: string) =>
      fetchWithAuth(u(`/api/delivery/pickup-points/${campus ? "?campus=" + campus : ""}`)),

    myAssignments: () => fetchWithAuth(u("/api/delivery/my-assignments/")),

    myBatches: () => fetchWithAuth(u("/api/delivery/my-batches/")),

    myHistory: () => fetchWithAuth(u("/api/delivery/my-history/")),

    myStats: () => fetchWithAuth(u("/api/delivery/my-stats/")),

    vendorEligibleBatches: (vendorId: number | string) =>
      fetchWithAuth(u(`/api/delivery/vendor-batches/${vendorId}/`)),

    updateStatus: (
      assignmentId: number | string,
      newStatus: string,
      extra?: { proofImage?: File; deliveryCode?: string },
    ) => {
      // 'picked_up' and 'completed' require a proof photo (and 'completed'
      // also a delivery code) — see delivery/views.py RiderUpdateStatusView.
      // 'at_pickup_point' needs neither, so keep sending plain JSON for it.
      if (extra?.proofImage) {
        const fd = new FormData();
        fd.append("status", newStatus);
        if (extra.deliveryCode) fd.append("delivery_code", extra.deliveryCode);
        fd.append("proof_image", extra.proofImage);
        return fetchWithAuth(u(`/api/delivery/assignments/${assignmentId}/update-status/`), {
          method: "POST",
          body: fd,
        });
      }
      return fetchWithAuth(u(`/api/delivery/assignments/${assignmentId}/update-status/`), {
        method: "POST",
        body: s({ status: newStatus }),
      });
    },

    orderStatus: (orderId: number | string) =>
      fetchWithAuth(u(`/api/delivery/order/${orderId}/`)),
  },
};
