// src/lib/useAuthInit.ts
import { useEffect } from "react";
import { useAuth } from "./authStore";

export const useAuthInit = () => {
  const { refreshProfile } = useAuth();

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);
};