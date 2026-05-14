// src/app/admin/sellers/page.tsx
"use client";

import { Search, Store, CheckCircle, Clock, Users, ChevronRight } from "lucide-react";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { fetchWithAuth } from "@/lib/authStore";
import { GRAD } from "@/lib/tokens";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export default function AdminSellers() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [sellers, setSellers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWithAuth(`${API_URL}/api/admin/users/?user_type=vendor`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setSellers(d.results || d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = sellers.filter(s =>
    s.username?.toLowerCase().includes(search.toLowerCase()) ||
    s.email?.toLowerCase().includes(search.toLowerCase()) ||
    s.profile?.matric_number?.toLowerCase().includes(search.toLowerCase()) ||
    s.business_name?.toLowerCase().includes(search.toLowerCase())
  );

  const verified = sellers.filter(s => s.profile?.is_verified_vendor).length;
  const pending = sellers.length - verified;

  return (
    <div className="min-h-screen bg-[#FFF8F0]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <AdminTopBar title="Vendors" back="/admin" />

      <div className="px-4 pt-4 pb-28 max-w-2xl mx-auto space-y-4">

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total", value: sellers.length, icon: Users, color: "#7C3AED" },
            { label: "Verified", value: verified, icon: CheckCircle, color: "#0D9488" },
            { label: "Pending", value: pending, icon: Clock, color: "#F59E0B" },
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

        {/* List */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white border border-stone-200 rounded-2xl h-20 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-stone-100 rounded-2xl p-10 text-center">
            <Store className="w-10 h-10 text-stone-200 mx-auto mb-3" />
            <p className="text-stone-400 text-sm">No vendors found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(seller => (
              <div
                key={seller.id}
                onClick={() => router.push(`/admin/users/${seller.id}`)}
                className="bg-white border border-stone-200 hover:border-teal-300 rounded-2xl p-4 flex items-center gap-3 transition-all cursor-pointer active:scale-[0.98] shadow-sm"
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                  style={{ background: GRAD }}>
                  {(seller.business_name || seller.username || "?")[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-stone-900 text-sm truncate">
                    {seller.business_name || seller.username}
                  </p>
                  <p className="text-stone-400 text-xs truncate">{seller.email}</p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 ${
                  seller.profile?.is_verified_vendor
                    ? "bg-teal-100 text-teal-700"
                    : "bg-amber-100 text-amber-700"
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
