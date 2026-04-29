// src/app/admin/users/page.tsx
"use client";

import { Search, Mail, ShieldCheck, User, Users } from "lucide-react";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { adminApi } from "@/lib/adminApi";

export default function AdminUsers() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    // Fetch real users from backend
    const fetchUsers = async () => {
      try {
        const data = await adminApi.getUsers();
        setUsers(data);
      } catch (error) {
        console.error("Failed to fetch users:", error);
      }
    };

    fetchUsers();
  }, []);

  const filtered = users.filter((u) =>
    u.username?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase()) ||
    u.profile?.matric_number?.toLowerCase().includes(search.toLowerCase())
  );

  const totalUsers = users.length;
  const sellersCount = users.filter(u => u.user_type === "vendor").length;
  const buyersCount = users.filter(u => u.user_type === "student").length;

  return (
    <>
      <AdminTopBar title="User Management" />

      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 px-5 pt-4 pb-32">
        <div className="relative mb-5">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/50" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, matric..."
            className="w-full pl-12 pr-4 py-3 bg-white/10 backdrop-blur-xl rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500/50 text-sm"
          />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-white/5 rounded-2xl p-4 text-center border border-white/10 animate-fadeIn">
            <Users className="w-8 h-8 mx-auto text-purple-400 mb-1" />
            <p className="text-2xl font-black text-white">{totalUsers}</p>
            <p className="text-xs text-white/60">Total Users</p>
          </div>
          <div className="bg-emerald-500/10 rounded-2xl p-4 text-center border border-emerald-500/30 animate-fadeIn">
            <ShieldCheck className="w-8 h-8 mx-auto text-emerald-400 mb-1" />
            <p className="text-2xl font-black text-white">{sellersCount}</p>
            <p className="text-xs text-white/60">Sellers</p>
          </div>
          <div className="bg-blue-500/10 rounded-2xl p-4 text-center border border-blue-500/30 animate-fadeIn">
            <User className="w-8 h-8 mx-auto text-blue-400 mb-1" />
            <p className="text-2xl font-black text-white">{buyersCount}</p>
            <p className="text-xs text-white/60">Buyers</p>
          </div>
        </div>

        {/* Users List */}
        <div className="space-y-4">
          {filtered.length === 0 ? (
            <div className="text-center py-16">
              <Users className="w-16 h-16 mx-auto text-white/20 mb-3" />
              <p className="text-white/60">No users found</p>
            </div>
          ) : (
            filtered.map((user, i) => (
              <div
                key={user.id}
                onClick={() => router.push(`/admin/users/${user.id}`)}
                className="bg-white/5 backdrop-blur-xl rounded-2xl p-5 border border-white/10 hover:border-purple-500/50 transition-all cursor-pointer animate-fadeUp active:scale-[0.98]"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-purple-600 to-teal-600 rounded-2xl flex items-center justify-center text-xl font-black text-white shadow-lg">
                      {user.username?.substring(0, 2).toUpperCase() || "U"}
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-lg">{user.username}</h3>
                      <p className="text-purple-300 text-sm flex items-center gap-1.5">
                        <Mail className="w-4 h-4" /> {user.email}
                      </p>
                      <p className="text-white/50 text-xs font-mono mt-1">
                        {user.profile?.matric_number || user.profile?.business_name || "—"}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 mb-2 ${
                      user.user_type === "vendor"
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/50"
                        : "bg-blue-500/20 text-blue-300 border border-blue-500/50"
                    }`}>
                      {user.user_type === "vendor" ? <ShieldCheck className="w-4 h-4" /> : <User className="w-4 h-4" />}
                      {user.user_type.toUpperCase()}
                    </div>
                    <p className="text-white/60 text-xs">
                      {new Date(user.date_joined).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                </div>

                {user.user_type === "vendor" && user.profile?.is_verified_vendor && (
                  <div className="mt-4 pt-4 border-t border-white/10 flex justify-between text-sm">
                    <span className="text-white/60">Verified Vendor</span>
                    <span className="text-emerald-400 font-bold flex items-center gap-1">
                      <ShieldCheck className="w-4 h-4" /> Yes
                    </span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}