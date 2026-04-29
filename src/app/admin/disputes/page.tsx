// src/app/admin/disputes/page.tsx
"use client";

import {
  AlertCircle,
  CheckCircle,
  Clock,
  Search,
  MessageSquare,
  DollarSign,
  User,
  Shield,
  XCircle,
  ArrowRight,
  Calendar,
} from "lucide-react";
import { useRouter } from "next/navigation";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { useState, useEffect, useMemo } from "react";

interface Dispute {
  id: string;
  orderId: string;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  sellerName: string;
  amount: number;
  reason: string;
  description: string;
  date: string;
  status: "open" | "resolved" | "appealed";
  resolution?: "refund" | "release";
}

function AdminDisputes() {
  const router = useRouter();
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const allOrders = JSON.parse(localStorage.getItem("allOrders") || "[]");
    const allDisputes = JSON.parse(localStorage.getItem("disputes") || "[]");

    // If no disputes exist, create some from disputed orders for demo
    if (allDisputes.length === 0 && allOrders.some((o: any) => o.status === "disputed")) {
      const disputedOrders = allOrders.filter((o: any) => o.status === "disputed");
      const newDisputes = disputedOrders.map((order: any, i: number) => ({
        id: `DSP${String(i + 1).padStart(3, "0")}`,
        orderId: order.id,
        buyerId: order.buyerId,
        buyerName: order.buyerName,
        sellerId: order.sellerId,
        sellerName: order.sellerName,
        amount: order.amount,
        reason: ["Item not as described", "Quality issue", "Wrong item sent", "Non-responsive seller"][i % 4],
        description: ["The product doesn't match the photos.", "Poor quality compared to listing.", "Received completely different item.", "Seller not responding to messages."][i % 4],
        date: order.date,
        status: "open",
      }));
      localStorage.setItem("disputes", JSON.stringify(newDisputes));
      setDisputes(newDisputes);
    } else {
      setDisputes(allDisputes);
    }
  }, []);

  const filteredDisputes = useMemo(() => {
    let filtered = disputes;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (d) =>
          d.id.toLowerCase().includes(q) ||
          d.buyerName.toLowerCase().includes(q) ||
          d.sellerName.toLowerCase().includes(q) ||
          d.orderId.toLowerCase().includes(q)
      );
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((d) => d.status === statusFilter);
    }

    return filtered;
  }, [disputes, searchQuery, statusFilter]);

  const stats = {
    total: disputes.length,
    open: disputes.filter((d) => d.status === "open").length,
    resolved: disputes.filter((d) => d.status === "resolved").length,
    appealed: disputes.filter((d) => d.status === "appealed").length,
  };

  const getStatusBadge = (status: string) => {
    const base = "px-4 py-2 rounded-full font-bold flex items-center gap-2 text-sm";
    switch (status) {
      case "open":
        return `${base} bg-red-500/20 text-red-300 border border-red-500/50`;
      case "resolved":
        return `${base} bg-emerald-500/20 text-emerald-300 border border-emerald-500/50`;
      case "appealed":
        return `${base} bg-amber-500/20 text-amber-300 border border-amber-500/50`;
      default:
        return `${base} bg-gray-500/20 text-gray-300`;
    }
  };

  if (!mounted) return null;

  return (
    <>
      <AdminTopBar title="Disputes" />

      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 px-5 pt-4 pb-32 space-y-6">
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/50" />
            <input
              type="text"
              placeholder="Search dispute, order, buyer, seller..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-white/10 backdrop-blur-xl rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {["all", "open", "resolved", "appealed"].map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-5 py-2 rounded-xl font-bold text-sm whitespace-nowrap transition ${
                  statusFilter === f
                    ? "bg-gradient-to-r from-purple-600 to-teal-600 text-white shadow-lg"
                    : "bg-white/10 text-white/60 hover:bg-white/20"
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)} ({stats[f === "all" ? "total" : f]})
              </button>
            ))}
          </div>
        </div>

        {/* STATS GRID */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Disputes", value: stats.total, color: "from-red-600 to-pink-600" },
            { label: "Open", value: stats.open, color: "from-red-500 to-orange-600" },
            { label: "Resolved", value: stats.resolved, color: "from-emerald-500 to-teal-600" },
            { label: "Appealed", value: stats.appealed, color: "from-amber-500 to-orange-600" },
          ].map((stat, i) => (
            <div
              key={stat.label}
              className={`bg-gradient-to-br ${stat.color} rounded-2xl p-5 text-white shadow-xl animate-fadeUp`}
            >
              <p className="text-sm opacity-90">{stat.label}</p>
              <p className="text-3xl font-black mt-1">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* DISPUTES LIST */}
        <div className="space-y-4">
          {filteredDisputes.length === 0 ? (
            <div className="text-center py-20">
              <Shield className="w-20 h-20 mx-auto text-white/10 mb-4" />
              <p className="text-white/60 text-lg">No disputes found</p>
            </div>
          ) : (
            filteredDisputes.map((dispute, i) => (
              <div
                key={dispute.id}
                onClick={() => router.push(`/admin/disputes/${dispute.id}`)}
                className="bg-white/5 backdrop-blur-xl rounded-2xl p-5 border border-white/10 hover:border-red-500/50 hover:bg-white/10 transition cursor-pointer animate-fadeUp"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-red-600 to-pink-600 rounded-2xl flex items-center justify-center text-xl font-black text-white">
                      {dispute.id.slice(3)}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white">{dispute.reason}</h3>
                      <p className="text-red-300 text-sm">Order: {dispute.orderId}</p>
                    </div>
                  </div>
                  <div className={getStatusBadge(dispute.status)}>
                    {dispute.status === "open" && <AlertCircle className="w-5 h-5" />}
                    {dispute.status === "resolved" && <CheckCircle className="w-5 h-5" />}
                    {dispute.status === "appealed" && <Clock className="w-5 h-5" />}
                    {dispute.status.toUpperCase()}
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-4 text-sm mb-4">
                  <div>
                    <p className="text-white/60">Buyer</p>
                    <p className="text-white font-bold">{dispute.buyerName}</p>
                  </div>
                  <div>
                    <p className="text-white/60">Seller</p>
                    <p className="text-white font-bold">{dispute.sellerName}</p>
                  </div>
                  <div>
                    <p className="text-white/60 flex items-center gap-1">
                      <DollarSign className="w-4 h-4" /> Amount
                    </p>
                    <p className="text-emerald-400 font-bold">₦{dispute.amount.toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-white/60 flex items-center justify-end gap-1">
                      <Calendar className="w-4 h-4" />
                    </p>
                    <p className="text-white font-medium text-sm">{new Date(dispute.date).toLocaleDateString()}</p>
                  </div>
                </div>

                <p className="text-white/70 text-sm mb-3 line-clamp-2">{dispute.description}</p>

                <div className="flex items-center justify-between">
                  <span className="text-white/50 text-xs">Tap to review & resolve</span>
                  <ArrowRight className="w-5 h-5 text-white/40" />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

export default AdminDisputes;