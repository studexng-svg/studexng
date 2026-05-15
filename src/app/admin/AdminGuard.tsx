"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/authStore";
import { useAdminMode } from "@/hooks/useAdminMode";
import { Shield } from "lucide-react";

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isLoggedIn, isAuthReady, isProfileReady } = useAuth();
  const { isAdmin } = useAdminMode();

  useEffect(() => {
    if (!isAuthReady) return;
    if (!isLoggedIn) {
      router.replace("/auth");
    }
  }, [isAuthReady, isLoggedIn, router]);

  // Show spinner while auth state is initialising OR while the server profile fetch
  // is still in flight (is_admin comes from the server, not localStorage).
  if (!isAuthReady || (isLoggedIn && !isProfileReady)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-purple-500/30 border-t-purple-400 rounded-full animate-spin" />
      </div>
    );
  }

  if (!isLoggedIn) return null;

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-20 h-20 mx-auto mb-6 bg-red-500/20 rounded-2xl flex items-center justify-center">
            <Shield className="w-10 h-10 text-red-400" />
          </div>
          <h1 className="text-2xl font-black text-white mb-2">Access Denied</h1>
          <p className="text-white/60 mb-6">You do not have admin privileges.</p>
          <button
            onClick={() => router.replace("/home")}
            className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-semibold transition"
          >
            Back to App
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
