import { useAuth } from "@/lib/authStore";

export function useAdminMode() {
  const { user, isLoggedIn } = useAuth();
  const isAdmin = isLoggedIn && user?.is_admin === true;
  return { isAdmin };
}
