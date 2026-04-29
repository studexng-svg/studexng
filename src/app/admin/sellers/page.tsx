// src/app/admin/sellers/page.tsx
"use client";

import { Store, CheckCircle, Clock, Search, Eye, Users } from "lucide-react";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminSellers() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [sellers, setSellers] = useState<any[]>([]);

  useEffect(() => {
    setSellers([
      { id: "SELL001", name: "Amaka Bello", email: "amaka@pau.edu.ng", matric: "PAU20230012", joinDate: "Mar 10, 2025", totalProducts: 18, totalSales: "₦842,000", status: "verified" },
      { id: "SELL002", name: "Victor Osahon", email: "victor@pau.edu.ng", matric: "PAU20231234", joinDate: "May 2, 2025", totalProducts: 7, totalSales: "₦124,500", status: "verified" },
      { id: "SELL003", name: "Chioma Eze", email: "chioma@pau.edu.ng", matric: "PAU20237891", joinDate: "Apr 18, 2025", totalProducts: 11, totalSales: "₦456,200", status: "verified" },
      { id: "SELL004", name: "Tunde Adeyemi", email: "tunde@pau.edu.ng", matric: "PAU20238902", joinDate: "Jun 1, 2025", totalProducts: 5, totalSales: "₦89,000", status: "pending" },
    ]);
  }, []);

  const filtered = sellers.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.email.toLowerCase().includes(search.toLowerCase()) ||
    s.matric.toLowerCase().includes(search.toLowerCase())
  );

  const verifiedCount = sellers.filter(s => s.status === "verified").length;
  const pendingCount = sellers.filter(s => s.status === "pending").length;

  const viewSeller = (id: string) => router.push(`/admin/sellers/${id}`);

  return (
    <>
      <AdminTopBar title="Seller Management" />

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

        {/* Compact Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-white/5 rounded-2xl p-4 text-center border border-white/10 animate-fadeIn">
            <Users className="w-8 h-8 mx-auto text-purple-400 mb-1" />
            <p className="text-2xl font-black text-white">{sellers.length}</p>
            <p className="text-xs text-white/60">Total</p>
          </div>
          <div className="bg-emerald-500/10 rounded-2xl p-4 text-center border border-emerald-500/30 animate-fadeIn">
            <CheckCircle className="w-8 h-8 mx-auto text-emerald-400 mb-1" />
            <p className="text-2xl font-black text-white">{verifiedCount}</p>
            <p className="text-xs text-white/60">Verified</p>
          </div>
          <div className="bg-amber-500/10 rounded-2xl p-4 text-center border border-amber-500/30 animate-fadeIn">
            <Clock className="w-8 h-8 mx-auto text-amber-400 mb-1" />
            <p className="text-2xl font-black text-white">{pendingCount}</p>
            <p className="text-xs text-white/60">Pending</p>
          </div>
        </div>

        {/* Clean Seller Cards */}
        <div className="space-y-4">
          {filtered.length === 0 ? (
            <div className="text-center py-16">
              <Users className="w-16 h-16 mx-auto text-white/20 mb-3" />
              <p className="text-white/60">No sellers found</p>
            </div>
          ) : (
            filtered.map((seller, i) => (
              <div
                key={seller.id}
                onClick={() => viewSeller(seller.id)}
                className="bg-white/5 backdrop-blur-xl rounded-2xl p-5 border border-white/10 hover:border-purple-500/50 transition-all cursor-pointer animate-fadeUp active:scale-[0.98]"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-teal-600 rounded-xl flex items-center justify-center">
                      <Store className="w-7 h-7 text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-lg">{seller.name}</h3>
                      <p className="text-purple-300 text-sm">{seller.email}</p>
                    </div>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${
                    seller.status === "verified"
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/50"
                      : "bg-amber-500/20 text-amber-300 border border-amber-500/50"
                  }`}>
                    {seller.status === "verified" ? <CheckCircle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                    {seller.status.toUpperCase()}
                  </div>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-white/60 font-mono">{seller.matric}</span>
                  <span className="text-white/80">{seller.totalProducts} products</span>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <span className="text-emerald-400 font-bold">{seller.totalSales}</span>
                  <Eye className="w-5 h-5 text-white/50" />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}