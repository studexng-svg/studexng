// src/app/admin/users/page.tsx
"use client";

import { Search, Users, Store, User } from "lucide-react";

function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function ActivityStatus({ lastSeen }: { lastSeen?: string | null }) {
  if (!lastSeen) return <span className="text-stone-300 text-xs">Never</span>;
  const mins = Math.floor((Date.now() - new Date(lastSeen).getTime()) / 60000);
  if (mins < 3) return (
    <span className="flex items-center gap-1">
      <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
      <span className="text-green-600 text-xs font-semibold">Online</span>
    </span>
  );
  return <span className="text-stone-400 text-xs">{relativeTime(lastSeen)}</span>;
}
import AdminTopBar from "@/components/layout/AdminTopBar";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { fetchAllPages, BASE_URL } from "@/lib/api";
import { GRAD } from "@/lib/tokens";
import { CampusPills, type Campus } from "@/components/admin/CampusPills";

export default function AdminUsers() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [campus, setCampus] = useState<Campus>("");
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback((s = search, c = campus) => {
    setLoading(true);
    let url = `${BASE_URL}/api/admin/users/?`;
    if (s) url += `search=${encodeURIComponent(s)}&`;
    if (c) url += `school=${c}`;
    fetchAllPages(url)
      .then(d => setUsers(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCampus = (c: Campus) => { setCampus(c); load(search, c); };
  const handleSearch = (s: string) => { setSearch(s); load(s, campus); };

  const vendors     = users.filter(u => u.user_type === "vendor").length;
  const nonStudents = users.filter(u => u.verification_type === "nin").length;
  const students    = users.filter(u => u.user_type === "student" && u.verification_type !== "nin").length;
  const [typeFilter, setTypeFilter] = useState<"" | "vendor" | "student" | "non_student">("");
  const visible = typeFilter === "non_student"
    ? users.filter(u => u.verification_type === "nin")
    : typeFilter === "student"
    ? users.filter(u => u.user_type === "student" && u.verification_type !== "nin")
    : typeFilter === "vendor"
    ? users.filter(u => u.user_type === "vendor")
    : users;

  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <AdminTopBar title="Users" back="/admin" />

      <div className="px-6 pt-5 pb-28 space-y-4">

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Total",        value: users.length, icon: Users, color: "#7C3AED", key: ""            as const },
            { label: "Vendors",      value: vendors,      icon: Store, color: "#0D9488", key: "vendor"      as const },
            { label: "Students",     value: students,     icon: User,  color: "#6366F1", key: "student"     as const },
            { label: "Non-Students", value: nonStudents,  icon: User,  color: "#f59e0b", key: "non_student" as const },
          ].map(({ label, value, icon: Icon, color, key }) => {
            const active = typeFilter === key;
            return (
              <button
                key={label}
                onClick={() => setTypeFilter(active && key !== "" ? "" : key)}
                className={`rounded-2xl p-3 text-center shadow-sm transition-all active:scale-95 border-2 ${
                  active ? "border-transparent" : "bg-white border-stone-200 hover:border-stone-300"
                }`}
                style={active ? { background: GRAD } : undefined}
              >
                <Icon className="w-5 h-5 mx-auto mb-1" style={{ color: active ? "#fff" : color }} />
                <p className={`text-xl font-bold ${active ? "text-white" : "text-stone-900"}`}>{loading ? "—" : value}</p>
                <p className={`text-xs ${active ? "text-stone-300" : "text-stone-400"}`}>{label}</p>
              </button>
            );
          })}
        </div>

        {/* Campus filter */}
        <CampusPills value={campus} onChange={handleCampus} />

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            value={search}
            onChange={e => handleSearch(e.target.value)}
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
        ) : visible.length === 0 ? (
          <div className="bg-white border border-stone-100 rounded-2xl p-10 text-center">
            <Users className="w-10 h-10 text-stone-200 mx-auto mb-3" />
            <p className="text-stone-400 text-sm">No users found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map(user => (
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
                  {(user.matric_number || user.nin) && (
                    <p className="text-stone-400 text-xs truncate">
                      {user.verification_type === "nin" && user.nin
                        ? `NIN: ${user.nin}`
                        : user.matric_number
                        ? `Matric: ${user.matric_number}`
                        : ""}
                    </p>
                  )}
                  <ActivityStatus lastSeen={user.last_seen} />
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 ${
                  user.school?.toLowerCase() === "futo" ? "bg-orange-100 text-orange-700"
                  : user.school?.toLowerCase() === "imsu" ? "bg-amber-100 text-amber-700"
                  : "bg-teal-50 text-teal-700"
                }`}>
                  {user.school?.toUpperCase() || "PAU"}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 ${
                  user.user_type === "vendor" ? "bg-purple-100 text-purple-700"
                  : user.verification_type === "nin" ? "bg-amber-100 text-amber-700"
                  : "bg-stone-100 text-stone-600"
                }`}>
                  {user.user_type === "vendor" ? "Vendor"
                   : user.verification_type === "nin" ? "Non-Student"
                   : "Student"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
