// src/app/admin/users/[id]/page.tsx
"use client";

import { motion } from "framer-motion";
import {
  ArrowLeft,
  Mail,
  Calendar,
  ShieldCheck,
  User,
  Ban,
  AlertTriangle,
  Eye,
  Users,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { fetchWithAuth } from "@/lib/authStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export default function AdminUserDetail() {
  const { id } = useParams();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch user from backend API
    const fetchUser = async () => {
      try {
        setLoading(true);
        const res = await fetchWithAuth(`${API_URL}/api/admin/users/${id}/`);
        if (!res.ok) throw new Error("Not found");
        const data = await res.json();
        setUser(data);
      } catch (error) {
        console.error("Failed to fetch user:", error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchUser();
    }
  }, [id]);

  const handleDeactivateUser = async () => {
    if (!confirm(`Are you sure you want to ${user.is_active ? 'deactivate' : 'activate'} this user?`)) return;
    try {
      const res = await fetchWithAuth(`${API_URL}/api/admin/users/${id}/`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !user.is_active }),
      });
      if (!res.ok) throw new Error("Failed");
      setUser({ ...user, is_active: !user.is_active });
    } catch (error: any) {
      alert(error.message || 'Failed to update user status');
    }
  };

  const handleVerifyVendor = async () => {
    if (!confirm('Are you sure you want to verify this vendor?')) return;
    try {
      const res = await fetchWithAuth(`${API_URL}/api/admin/users/${id}/`, {
        method: "PATCH",
        body: JSON.stringify({ profile: { is_verified_vendor: true } }),
      });
      if (!res.ok) throw new Error("Failed");
      setUser({ ...user, profile: { ...user.profile, is_verified_vendor: true } });
    } catch (error: any) {
      alert(error.message || 'Failed to verify vendor');
    }
  };

  const initials = user?.username?.substring(0, 2).toUpperCase() || "??";

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/60">Loading user details...</p>
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex flex-col items-center justify-center px-6">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center space-y-8">
          <div className="w-32 h-32 bg-white/10 backdrop-blur-xl rounded-3xl flex items-center justify-center border border-white/20">
            <Users className="w-16 h-16 text-white/30" />
          </div>
          <div>
            <h2 className="text-3xl font-black text-white mb-2">User Not Found</h2>
            <p className="text-white/60">This user may have been removed or never existed.</p>
          </div>
          <button
            onClick={() => router.push("/admin/users")}
            className="px-10 py-5 bg-gradient-to-r from-purple-600 to-teal-600 text-white font-black text-lg rounded-2xl shadow-2xl hover:shadow-purple-500/50 transition-all flex items-center gap-3 mx-auto"
          >
            <Users className="w-6 h-6" />
            Back to All Users
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <>
      {/* TOP BAR */}
      <motion.div
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        className="sticky top-0 z-50 bg-gradient-to-r from-slate-900 via-purple-900 to-slate-900 border-b border-white/10 backdrop-blur-xl"
      >
        <div className="flex items-center justify-between px-5 py-4">
          <button onClick={() => router.back()} className="p-2 hover:bg-white/10 rounded-xl transition">
            <ArrowLeft className="w-6 h-6 text-white" />
          </button>
          <h1 className="text-xl font-black text-white">User Profile</h1>
          <div className="w-10" />
        </div>
      </motion.div>

      {/* MAIN CONTENT */}
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 px-5 pt-4 pb-32 space-y-6">

        {/* HERO CARD */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/5 backdrop-blur-xl rounded-3xl p-6 border border-white/10 shadow-2xl"
        >
          <div className="flex items-center gap-5">
            <div className="w-24 h-24 bg-gradient-to-br from-purple-600 to-teal-600 rounded-3xl flex items-center justify-center text-3xl font-black text-white shadow-2xl">
              {initials}
            </div>
            <div className="flex-1">
              <h2 className="text-3xl font-black text-white">{user.username}</h2>
              <p className="text-purple-300 text-lg font-medium flex items-center gap-2 mt-1">
                <Mail className="w-5 h-5" /> {user.email}
              </p>
              <p className="text-white/60 text-sm font-mono mt-1">
                {user.profile?.matric_number || user.profile?.business_name || user.phone || "—"}
              </p>
            </div>
            <div className={`px-5 py-3 rounded-full font-bold text-lg flex items-center gap-2 ${
              user.user_type === "vendor"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/50"
                : "bg-blue-500/20 text-blue-300 border border-blue-500/50"
            }`}>
              {user.user_type === "vendor" ? (
                <ShieldCheck className="w-6 h-6" />
              ) : (
                <User className="w-6 h-6" />
              )}
              {user.user_type.toUpperCase()}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-8">
            <div className={`backdrop-blur-xl rounded-2xl p-5 text-center border ${
              user.is_active
                ? 'bg-emerald-500/10 border-emerald-500/30'
                : 'bg-red-500/10 border-red-500/30'
            }`}>
              <p className="text-white/60 text-sm">Account Status</p>
              <p className={`text-2xl font-black mt-2 ${user.is_active ? 'text-emerald-400' : 'text-red-400'}`}>
                {user.is_active ? 'Active' : 'Inactive'}
              </p>
            </div>
            <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-5 text-center border border-white/10">
              <Calendar className="w-10 h-10 mx-auto text-teal-400 mb-2" />
              <p className="text-white/60 text-sm">Joined</p>
              <p className="text-lg font-bold text-white">
                {new Date(user.date_joined).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          </div>

          {user.user_type === "vendor" && (
            <div className={`mt-4 p-4 rounded-2xl ${
              user.profile?.is_verified_vendor
                ? 'bg-emerald-500/10 border-emerald-500/30'
                : 'bg-amber-500/10 border-amber-500/30'
            } border`}>
              <p className="text-white/80 text-sm font-semibold flex items-center gap-2">
                {user.profile?.is_verified_vendor ? (
                  <>
                    <ShieldCheck className="w-5 h-5 text-emerald-400" />
                    Verified Vendor
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-5 h-5 text-amber-400" />
                    Pending Verification
                  </>
                )}
              </p>
            </div>
          )}
        </motion.div>

        {/* ACTION BUTTONS */}
        <div className="space-y-4">
          {user.user_type === "vendor" && !user.profile?.is_verified_vendor && (
            <button
              onClick={handleVerifyVendor}
              className="w-full py-5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-black text-lg rounded-2xl shadow-xl hover:shadow-emerald-500/50 transition-all flex items-center justify-center gap-3"
            >
              <ShieldCheck className="w-6 h-6" />
              Verify Vendor
            </button>
          )}

          <button
            onClick={handleDeactivateUser}
            className={`w-full py-5 text-white font-black text-lg rounded-2xl shadow-xl transition-all flex items-center justify-center gap-3 ${
              user.is_active
                ? 'bg-gradient-to-r from-amber-500 to-orange-600 hover:shadow-amber-500/50'
                : 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:shadow-emerald-500/50'
            }`}
          >
            <Ban className="w-6 h-6" />
            {user.is_active ? 'Deactivate User' : 'Activate User'}
          </button>

          <button
            onClick={() => router.push("/admin/users")}
            className="w-full py-5 bg-white/5 border border-white/10 text-white font-black text-lg rounded-2xl hover:bg-white/10 transition-all flex items-center justify-center gap-3"
          >
            <Users className="w-6 h-6" />
            Back to All Users
          </button>
        </div>
      </div>
    </>
  );
}