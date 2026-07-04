// src/app/admin/sellers/page.tsx
"use client";

import { Search, Store, CheckCircle, Clock, Users, ChevronRight } from "lucide-react";

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
import { useRouter, useSearchParams } from "next/navigation";
import { fetchAllPages, BASE_URL } from "@/lib/api";
import { GRAD } from "@/lib/tokens";
import { CampusPills, type Campus } from "@/components/admin/CampusPills";

export default function AdminSellers() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [campus, setCampus] = useState<Campus>((searchParams.get("campus") || "") as Campus);
  const [sellers, setSellers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback((s = search, c = campus) => {
    setLoading(true);
    let url = `${BASE_URL}/api/admin/users/?user_type=vendor&`;
    if (s) url += `search=${encodeURIComponent(s)}&`;
    if (c) url += `school=${c}`;
    fetchAllPages(url)
      .then(d => setSellers(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCampus = (c: Campus) => {
    setCampus(c);
    const params = new URLSearchParams(searchParams.toString());
    if (c) params.set("campus", c); else params.delete("campus");
    router.replace(`/admin/sellers?${params.toString()}`);
    load(search, c);
  };
  const handleSearch = (s: string) => { setSearch(s); load(s, campus); };

  const verified = sellers.filter(s => s.profile?.is_verified_vendor).length;
  const pending  = sellers.length - verified;
  const [verifiedFilter, setVerifiedFilter] = useState<"" | "verified" | "pending">("");
  const visible = verifiedFilter === "verified"
    ? sellers.filter(s => s.profile?.is_verified_vendor)
    : verifiedFilter === "pending"
    ? sellers.filter(s => !s.profile?.is_verified_vendor)
    : sellers;

  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <AdminTopBar title="Vendors" back="/admin" />

      <div className="px-6 pt-5 pb-28 space-y-4">

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total",    value: sellers.length, icon: Users,       color: "#7C3AED", key: ""         as const },
            { label: "Verified", value: verified,       icon: CheckCircle, color: "#0D9488", key: "verified" as const },
            { label: "Pending",  value: pending,        icon: Clock,       color: "#F59E0B", key: "pending"  as const },
          ].map(({ label, value, icon: Icon, color, key }) => {
            const active = verifiedFilter === key;
            return (
              <button
                key={label}
                onClick={() => setVerifiedFilter(active && key !== "" ? "" : key)}
                className={`rounded-2xl p-3 text-center shadow-sm transition-all active:scale-95 border-2 ${
                  active ? "border-transparent" : "bg-white border-stone-200 hover:border-stone-300"
                }`}
                style={active ? { background: "#0D9488" } : undefined}
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
            placeholder="Search name, email, business…"
            className="w-full pl-10 pr-4 py-3 bg-white border border-stone-200 rounded-xl text-stone-900 placeholder:text-stone-400 text-sm focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20"
          />
        </div>

        {/* List */}
        {loading ? (
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="p-4 h-20 animate-pulse border-b border-stone-100 last:border-0 bg-stone-50/50" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="bg-white border border-stone-100 rounded-2xl p-10 text-center">
            <Store className="w-10 h-10 text-stone-200 mx-auto mb-3" />
            <p className="text-stone-400 text-sm">No vendors found</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
            {visible.map(seller => (
              <div
                key={seller.id}
                onClick={() => router.push(`/admin/users/${seller.id}`)}
                className="border-b border-stone-100 last:border-0 p-4 flex items-center gap-3 hover:bg-stone-50/50 cursor-pointer transition-colors"
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                  style={{ background: GRAD, boxShadow: "0 2px 12px rgba(13,148,136,0.35)" }}>
                  {(seller.business_name || seller.username || "?")[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-stone-900 text-sm truncate">
                    {seller.business_name || seller.username}
                  </p>
                  <p className="text-stone-400 text-xs truncate">{seller.email}</p>
                  <ActivityStatus lastSeen={seller.last_seen} />
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold flex-shrink-0 ${
                  seller.school?.toLowerCase() === "futo"
                    ? "bg-orange-100 text-orange-700"
                    : "bg-teal-50 text-teal-700"
                }`}>
                  {seller.school?.toUpperCase() || "PAU"}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 ${
                  seller.profile?.is_verified_vendor ? "bg-teal-100 text-teal-700" : "bg-amber-100 text-amber-700"
                }`}>
                  {seller.profile?.is_verified_vendor ? "Verified" : "Pending"}
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
