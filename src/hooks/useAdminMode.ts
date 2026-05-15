import { useAuth } from "@/lib/authStore";

const ADMIN_EMAIL = "studex.ng@gmail.com";

export function useAdminMode() {
  const { user, isLoggedIn } = useAuth();
  const isAdmin = isLoggedIn && user?.email === ADMIN_EMAIL;
  return { isAdmin };
}
