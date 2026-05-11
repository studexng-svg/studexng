// lib/api.ts
import { fetchWithAuth, useAuth } from "@/lib/authStore";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

// ================= TYPES =================

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

export interface EmailOtpRequest {
  email: string;
}

export interface VerifyEmailOtpRequest {
  email: string;
  code: string;
}

// ================= API CLASS =================

class API {
  // ---------- AUTH ----------

  async register(data: RegisterData): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE_URL}/api/auth/register/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Registration failed");
    }

    const result = await response.json();
    useAuth.getState().login(result.user, result.tokens.access, result.tokens.refresh);
    return result;
  }

  async login(data: LoginData): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE_URL}/api/auth/login/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Login failed");
    }

    const result = await response.json();
    useAuth.getState().login(result.user, result.tokens.access, result.tokens.refresh);
    return result;
  }

  async forgotPassword(email: string): Promise<{ detail: string; reset_url?: string }> {
    const response = await fetch(`${API_BASE_URL}/api/auth/forgot-password/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || error.email?.[0] || "Failed to send reset link");
    }

    return response.json();
  }

  // ---------- EMAIL OTP ----------

  async sendEmailOtp(data: EmailOtpRequest): Promise<{ message: string }> {
    const response = await fetch(`${API_BASE_URL}/api/auth/email/send-otp/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Failed to send email code");
    }

    return response.json();
  }

  async verifyEmailOtp(data: VerifyEmailOtpRequest): Promise<{ message: string }> {
    const response = await fetch(`${API_BASE_URL}/api/auth/email/verify-otp/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Invalid or expired code");
    }

    return response.json();
  }

  // ---------- USER ----------

  async logout(): Promise<void> {
    try {
      await fetchWithAuth(`${API_BASE_URL}/api/auth/logout/`, { method: "POST" });
    } finally {
      useAuth.getState().logout();
    }
  }

  async getProfile(): Promise<UserProfile> {
    const response = await fetchWithAuth(`${API_BASE_URL}/api/auth/profile/`);
    if (!response.ok) throw new Error("Failed to fetch profile");
    return response.json();
  }

  async updateProfile(data: Partial<UserProfile>): Promise<AuthResponse> {
    const response = await fetchWithAuth(`${API_BASE_URL}/api/auth/profile/update/`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });

    if (!response.ok) throw new Error("Failed to update profile");

    const result = await response.json();
    useAuth.getState().setUser(result.user);
    return result;
  }

  isAuthenticated(): boolean {
    return useAuth.getState().isLoggedIn;
  }

  getCurrentUser(): UserProfile | null {
    return useAuth.getState().user as UserProfile | null;
  }
}

// ✅ SINGLE EXPORT
export const api = new API();
