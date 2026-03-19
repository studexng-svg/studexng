// lib/api.ts
// Central API service for communicating with Django backend

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

// ================= HELPERS =================

const getAuthHeaders = () => {
  const token = localStorage.getItem("access_token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

// ================= API CLASS =================

class API {
  // ---------- AUTH ----------

  async register(data: RegisterData): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE_URL}/api/auth/register/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Registration failed");
    }

    const result = await response.json();

    localStorage.setItem("access_token", result.tokens.access);
    localStorage.setItem("refresh_token", result.tokens.refresh);
    localStorage.setItem("user", JSON.stringify(result.user));

    return result;
  }

  async login(data: LoginData): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE_URL}/api/auth/login/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Login failed");
    }

    const result = await response.json();

    localStorage.setItem("access_token", result.tokens.access);
    localStorage.setItem("refresh_token", result.tokens.refresh);
    localStorage.setItem("user", JSON.stringify(result.user));

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

    return response.json(); // returns { detail, reset_url }
  }

  // ---------- EMAIL OTP ----------

  async sendEmailOtp(
    data: EmailOtpRequest
  ): Promise<{ message: string }> {
    const response = await fetch(
      `${API_BASE_URL}/api/auth/email/send-otp/`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Failed to send email code");
    }

    return response.json();
  }

  async verifyEmailOtp(
    data: VerifyEmailOtpRequest
  ): Promise<{ message: string }> {
    const response = await fetch(
      `${API_BASE_URL}/api/auth/email/verify-otp/`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Invalid or expired code");
    }

    return response.json();
  }

  // ---------- USER ----------

  async logout(): Promise<void> {
    try {
      await fetch(`${API_BASE_URL}/api/auth/logout/`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
    } finally {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      localStorage.removeItem("user");
    }
  }

  async getProfile(): Promise<UserProfile> {
    const response = await fetch(`${API_BASE_URL}/api/auth/profile/`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      if (response.status === 401) {
        await this.refreshToken();
        return this.getProfile();
      }
      throw new Error("Failed to fetch profile");
    }

    return response.json();
  }

  async updateProfile(
    data: Partial<UserProfile>
  ): Promise<AuthResponse> {
    const response = await fetch(
      `${API_BASE_URL}/api/auth/profile/update/`,
      {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      }
    );

    if (!response.ok) {
      throw new Error("Failed to update profile");
    }

    const result = await response.json();
    localStorage.setItem("user", JSON.stringify(result.user));
    return result;
  }

  async refreshToken(): Promise<void> {
    const refreshToken = localStorage.getItem("refresh_token");
    if (!refreshToken) throw new Error("No refresh token available");

    const response = await fetch(
      `${API_BASE_URL}/api/auth/token/refresh/`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh: refreshToken }),
      }
    );

    if (!response.ok) {
      this.logout();
      throw new Error("Session expired. Please login again.");
    }

    const result = await response.json();
    localStorage.setItem("access_token", result.access);
  }

  isAuthenticated(): boolean {
    return !!localStorage.getItem("access_token");
  }

  getCurrentUser(): UserProfile | null {
    const userStr = localStorage.getItem("user");
    return userStr ? JSON.parse(userStr) : null;
  }
}

// ✅ SINGLE EXPORT
export const api = new API();