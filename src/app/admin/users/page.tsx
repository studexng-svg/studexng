// src/app/admin/users/page.tsx
"use client";

import { Search, Users, Store, User, ChevronRight } from "lucide-react";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { fetchWithAuth } from "@/lib/authStore";
import { GRAD } from "@/lib/tokens";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export default function AdminUsers() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWithAuth(`${API_URL}/api/admin/users/`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setUsers(d.results || d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = users.filter(u =>
    u.username?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase()) ||
    u.profile?.matric_number?.toLowerCase().includes(search.toLowerCase())
  );

  const vendors = users.filter(u => u.user_type === "vendor").length;
  const students = users.filter(u => u.user_type === "student").length;

  return (
    <div className="min-h-screen bg-[#FFF8F0]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <AdminTopBar title="Users" back="/admin" />

      <div className="px-4 pt-4 pb-28 max-w-2xl mx-auto space-y-4">

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total", value: users.length, icon: Users, color: "#7C3AED" },
            { label: "Vendors", value: vendors, icon: Store, color: "#0D9488" },
            { label: "Students", value: students, icon: User, color: "#6366F1" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-white border border-stone-200 rounded-2xl p-3 text-center shadow-sm">
              <Icon className="w-5 h-5 mx-auto mb-1" style={{ color }} />
              <p className="text-xl font-bold text-stone-900">{loading ? "—" : value}</p>
              <p className="text-xs text-stone-400">{label}</p>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, email, matric…"
            className="w-full pl-10 pr-4 py-3 bg-white border border-stone-200 rounded-xl text-stone-900 placeholder:text-stone-400 text-sm focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20"
          />
        </div>

        {/* User list */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-white border border-stone-200 rounded-2xl h-16 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-stone-100 rounded-2xl p-10 text-center">
            <Users className="w-10 h-10 text-stone-200 mx-auto mb-3" />
            <p className="text-stone-400 text-sm">No users found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(user => (
              <div
                key={user.id}
                onClick={() => router.push(`/admin/users/${user.id}`)}
                className="bg-white border border-stone-200 hover:border-teal-300 rounded-2xl p-3.5 flex items-center gap-3 transition-all cursor-pointer active:scale-[0.98] shadow-sm"
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                  style={{ background: GRAD }}>
                  {(user.business_name || user.username || "?")[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-stone-900 text-sm truncate">{user.username}</p>
                  <p className="text-stone-400 text-xs truncate">{user.email}</p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 ${
                  user.user_type === "vendor" ? "bg-teal-100 text-teal-700" : "bg-stone-100 text-stone-600"
                }`}>
                  {user.user_type === "vendor" ? "Vendor" : "Student"}
                </span>
                <ChevronRight className="w-4 h-4 text-stone-400 flex-shrink-0" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
