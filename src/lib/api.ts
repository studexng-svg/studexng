// src/lib/api.ts
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export interface RegisterData {
  username: string;
  email: string;
  phone: string;
  password: string;
  password2: string;
  user_type: "student" | "vendor";
  matric_number?: string;
  hostel?: string;
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
  matric_number?: string;
  hostel?: string;
  business_name?: string;
  is_verified_vendor: boolean;
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

function readAuthStorage() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("auth-storage");
    if (!raw) return null;
    return JSON.parse(raw)?.state || null;
  } catch {
    return null;
  }
}

function getAccessToken(): string | null {
  return readAuthStorage()?.accessToken || null;
}

function getRefreshToken(): string | null {
  return readAuthStorage()?.refreshToken || null;
}

class API {
  private baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  private async request(endpoint: string, options: RequestInit = {}): Promise<any> {
    const token = getAccessToken();
    const headers = new Headers(options.headers || {});
    headers.set("Content-Type", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);

    const response = await fetch(`${this.baseURL}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      // 1. Try the simple top-level error fields first
      let msg = data.error || data.detail || data.message ||
        (data.non_field_errors && data.non_field_errors[0]);

      // 2. If none of those exist, Django returned field-level validation errors
      //    e.g. { "username": ["A user with that username already exists."],
      //           "email": ["user with this email already exists."] }
      //    Extract them all and join into a readable message.
      if (!msg) {
        const reserved = ["error", "detail", "message", "non_field_errors", "status_code"];
        const fieldErrors = Object.entries(data)
          .filter(([key]) => !reserved.includes(key))
          .map(([field, errs]) => {
            const errText = Array.isArray(errs) ? errs[0] : String(errs);
            // Capitalise field name for readability
            const label = field.charAt(0).toUpperCase() + field.slice(1).replace(/_/g, " ");
            return `${label}: ${errText}`;
          });
        msg = fieldErrors.length > 0 ? fieldErrors.join(" • ") : "Request failed";
      }

      const err: any = new Error(msg);
      err.disabled = data.disabled || false;
      err.status = response.status;
      err.fieldErrors = data; // attach raw errors in case caller wants them
      throw err;
    }

    return data;
  }

  register(data: RegisterData) {
    return this.request("/api/auth/register/", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  login(data: LoginData) {
    return this.request("/api/auth/login/", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  logout() {}

  async forgotPassword(email: string): Promise<{ detail: string; reset_url?: string }> {
    const response = await fetch(`${this.baseURL}/api/auth/forgot-password/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Failed to send reset link");
    }
    return response.json();
  }

  getProfile() {
    return this.request("/api/auth/profile/");
  }

  updateProfile(data: Partial<UserProfile>) {
    return this.request("/api/auth/profile/update/", {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async getListings(params?: { category?: string; search?: string }) {
    const url = new URL(`${this.baseURL}/api/services/listings/`);
    if (params?.category) url.searchParams.append("category", params.category);
    if (params?.search) url.searchParams.append("search", params.search);
    const response = await fetch(url.toString());
    if (!response.ok) throw new Error("Failed to fetch listings");
    const result = await response.json();
    return result.results || result;
  }

  async getCategories() {
    const response = await fetch(`${this.baseURL}/api/services/categories/`);
    if (!response.ok) throw new Error("Failed to fetch categories");
    const result = await response.json();
    return result.results || result;
  }

  isAuthenticated(): boolean {
    return !!getAccessToken();
  }
}

export const api = new API(API_BASE_URL);