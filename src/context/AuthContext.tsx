// src/context/AuthContext.tsx
"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "@/lib/authStore";
import { useRouter, usePathname } from "next/navigation";

interface AuthContextType {
  isLoggedIn: boolean;
  user: any | null;
  isLoading: boolean;
  isAuthReady: boolean;
}

const AuthContext = createContext<AuthContextType>({
  isLoggedIn: false,
  user: null,
  isLoading: true,
  isAuthReady: false,
});

export const useAuthContext = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  // ── Removed checkAuth — it does not exist on the Zustand authStore.
  // isHydrated becomes true once Zustand rehydrates from localStorage,
  // which is the correct signal that auth state is ready.
  const { user, isLoggedIn, isAuthReady, isHydrated } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Once Zustand has rehydrated from localStorage, auth is ready
    if (isHydrated) {
      setIsLoading(false);
    }
  }, [isHydrated]);

  // Redirect unauthenticated users away from protected routes
  useEffect(() => {
    if (!isAuthReady || isLoading) return;

    const publicRoutes = ["/", "/auth", "/terms", "/privacy", "/contact"];
    const isPublicRoute = publicRoutes.includes(pathname);

    if (!isLoggedIn && !isPublicRoute) {
      router.push("/auth");
    }
  }, [isLoggedIn, isAuthReady, isLoading, pathname, router]);

  return (
    <AuthContext.Provider value={{ isLoggedIn, user, isLoading, isAuthReady }}>
      {children}
    </AuthContext.Provider>
  );
};
