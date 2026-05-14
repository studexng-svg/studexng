// src/app/admin/users/[id]/page.tsx
"use client";

import {
  Mail,
  ShieldCheck,
  User,
  Ban,
  AlertTriangle,
  Users,
} from "lucide-react";
import AdminTopBar from "@/components/layout/AdminTopBar";
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
      <div className="min-h-screen bg-[#FFF8F0] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-stone-200 border-t-teal-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#FFF8F0] flex flex-col items-center justify-center px-6 gap-4">
        <Users className="w-12 h-12 text-stone-300" />
        <p className="text-stone-500 font-medium">User not found</p>
        <button onClick={() => router.push("/admin/users")}
          className="px-5 py-2.5 bg-white border border-stone-200 rounded-full text-stone-700 text-sm font-semibold transition hover:border-stone-300">
          Back to Users
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFF8F0]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <AdminTopBar title="User Detail" back="/admin/users" />

      <div className="px-4 pt-5 pb-28 max-w-2xl mx-auto space-y-4">

        {/* Profile card */}
        <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
              style={{ background: "linear-gradient(135deg,#0D9488,#7C3AED)" }}>
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-bold text-stone-900">{user.username}</p>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                  user.user_type === "vendor" ? "bg-teal-100 text-teal-700" : "bg-stone-100 text-stone-600"
                }`}>
                  {user.user_type === "vendor" ? "Vendor" : "Student"}
                </span>
              </div>
              <p className="text-stone-500 text-sm mt-0.5 flex items-center gap-1">
                <Mail className="w-3.5 h-3.5" /> {user.email}
              </p>
              {(user.profile?.matric_number || user.profile?.business_name) && (
                <p className="text-stone-400 text-xs mt-0.5 font-mono">
                  {user.profile?.matric_number || user.profile?.business_name}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className={`rounded-xl p-3 text-center ${user.is_active ? "bg-teal-50 border border-teal-200" : "bg-red-50 border border-red-200"}`}>
              <p className="text-xs text-stone-500 mb-0.5">Status</p>
              <p className={`font-bold text-sm ${user.is_active ? "text-teal-700" : "text-red-600"}`}>
                {user.is_active ? "Active" : "Inactive"}
              </p>
            </div>
            <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 text-center">
              <p className="text-xs text-stone-500 mb-0.5">Joined</p>
              <p className="font-bold text-stone-900 text-sm">
                {new Date(user.date_joined).toLocaleDateString("en-NG", { month: "short", day: "numeric", year: "numeric" })}
              </p>
            </div>
          </div>

          {user.user_type === "vendor" && (
            <div className={`mt-3 p-3 rounded-xl flex items-center gap-2 ${
              user.profile?.is_verified_vendor ? "bg-teal-50 border border-teal-200" : "bg-amber-50 border border-amber-200"
            }`}>
              {user.profile?.is_verified_vendor
                ? <><ShieldCheck className="w-4 h-4 text-teal-600" /><p className="text-teal-700 text-sm font-semibold">Verified Vendor</p></>
                : <><AlertTriangle className="w-4 h-4 text-amber-600" /><p className="text-amber-700 text-sm font-semibold">Pending Verification</p></>}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-2">
          {user.user_type === "vendor" && !user.profile?.is_verified_vendor && (
            <button onClick={handleVerifyVendor}
              className="w-full py-3.5 text-white font-semibold rounded-xl flex items-center justify-center gap-2 text-sm shadow-sm transition hover:opacity-90"
              style={{ background: "linear-gradient(135deg,#0D9488,#7C3AED)" }}>
              <ShieldCheck className="w-4 h-4" /> Verify Vendor
            </button>
          )}
          <button onClick={handleDeactivateUser}
            className={`w-full py-3.5 font-semibold rounded-xl flex items-center justify-center gap-2 text-sm transition ${
              user.is_active
                ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                : "bg-teal-100 text-teal-700 hover:bg-teal-200"
            }`}>
            <Ban className="w-4 h-4" />
            {user.is_active ? "Deactivate User" : "Activate User"}
          </button>
        </div>
      </div>
    </div>
  );
}