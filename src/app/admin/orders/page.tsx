// src/app/admin/orders/page.tsx
"use client";

import {
  Package,
  Clock,
  CheckCircle,
  AlertCircle,
  Search,
  ArrowRight,
  Calendar,
  DollarSign,
  Shield,
} from "lucide-react";
import { useRouter } from "next/navigation";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { useState, useEffect, useMemo } from "react";

interface Order {
  id: string;
  buyerName: string;
  sellerName: string;
  amount: number;
  date: string;
  status: "pending_confirmation" | "completed" | "disputed" | "refunded";
  type: "service" | "food";
}

function AdminOrders() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const allOrders = JSON.parse(localStorage.getItem("allOrders") || "[]");
    setOrders(allOrders);
  }, []);

  const filteredOrders = useMemo(() => {
    let filtered = orders;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (o) =>
          o.id.toLowerCase().includes(q) ||
          o.buyerName.toLowerCase().includes(q) ||
          o.sellerName.toLowerCase().includes(q) ||
          o.amount.toString().includes(q)
      );
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((o) => o.status === statusFilter);
    }

    return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [orders, searchQuery, statusFilter]);

  const stats = {
    total: orders.length,
    pending: orders.filter((o) => o.status === "pending_confirmation").length,
    completed: orders.filter((o) => o.status === "completed").length,
    disputed: orders.filter((o) => o.status === "disputed").length,
    refunded: orders.filter((o) => o.status === "refunded").length,
  };

  const getStatusBadge = (status: string) => {
    const base = "px-4 py-2 rounded-full font-bold flex items-center gap-2 text-sm";
    switch (status) {
      case "pending_confirmation":
        return `${base} bg-amber-500/20 text-amber-300 border border-amber-500/50`;
      case "completed":
        return `${base} bg-emerald-500/20 text-emerald-300 border border-emerald-500/50`;
      case "disputed":
        return `${base} bg-red-500/20 text-red-300 border border-red-500/50`;
      case "refunded":
        return `${base} bg-blue-500/20 text-blue-300 border border-blue-500/50`;
      default:
        return `${base} bg-gray-500/20 text-gray-300`;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending_confirmation":
        return <Clock className="w-5 h-5" />;
      case "completed":
        return <CheckCircle className="w-5 h-5" />;
      case "disputed":
        return <AlertCircle className="w-5 h-5" />;
      case "refunded":
        return <ArrowRight className="w-5 h-5" />;
      default:
        return <Package className="w-5 h-5" />;
    }
  };

  if (!mounted) return null;

  return (
    <>
      <AdminTopBar title="Order Management" />

      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 px-5 pt-4 pb-32 space-y-6">
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/50" />
            <input
              type="text"
              placeholder="Search order, buyer, seller..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-white/10 backdrop-blur-xl rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {["all", "pending_confirmation", "completed", "disputed", "refunded"].map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-5 py-2 rounded-xl font-bold text-sm whitespace-nowrap transition ${
                  statusFilter === f
                    ? "bg-gradient-to-r from-purple-600 to-teal-600 text-white shadow-lg"
                    : "bg-white/10 text-white/60 hover:bg-white/20"
                }`}
              >
                {f === "all"
                  ? "All"
                  : f === "pending_confirmation"
                  ? "Pending"
                  : f.charAt(0).toUpperCase() + f.slice(1)}{" "}
                ({stats[f === "all" ? "total" : (f as keyof typeof stats)]})
              </button>
            ))}
          </div>
        </div>
        {/* STATS GRID */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { label: "Total Orders", value: stats.total, color: "from-purple-600 to-pink-600" },
            { label: "Pending", value: stats.pending, color: "from-amber-500 to-orange-600" },
            { label: "Completed", value: stats.completed, color: "from-emerald-500 to-teal-600" },
            { label: "Disputed", value: stats.disputed, color: "from-red-500 to-orange-600" },
            { label: "Refunded", value: stats.refunded, color: "from-blue-500 to-cyan-600" },
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

        {/* ORDERS LIST */}
        <div className="space-y-4">
          {filteredOrders.length === 0 ? (
            <div className="text-center py-20 bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10">
              <Package className="w-20 h-20 mx-auto text-white/10 mb-4" />
              <p className="text-white/60 text-lg">No orders found</p>
              <p className="text-white/40 text-sm mt-2">Orders will appear here when buyers make purchases</p>
            </div>
          ) : (
            filteredOrders.map((order, i) => (
              <div
                key={order.id}
                onClick={() => router.push(`/admin/orders/${order.id}`)}
                className="bg-white/5 backdrop-blur-xl rounded-2xl p-5 border border-white/10 hover:border-purple-500/50 hover:bg-white/10 transition cursor-pointer animate-fadeUp"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-purple-600 to-teal-600 rounded-2xl flex items-center justify-center text-xl font-black text-white">
                      {order.id.substring(order.id.length - 3)}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white">{order.buyerName}</h3>
                      <p className="text-purple-300 text-sm">→ {order.sellerName}</p>
                    </div>
                  </div>
                  <div className={getStatusBadge(order.status)}>
                    {getStatusIcon(order.status)}
                    {order.status === "pending_confirmation"
                      ? "PENDING"
                      : order.status.toUpperCase()}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 text-sm mb-4">
                  <div>
                    <p className="text-white/60">Order ID</p>
                    <p className="text-white font-mono font-bold text-xs">{order.id}</p>
                  </div>
                  <div>
                    <p className="text-white/60 flex items-center gap-1">
                      <Shield className="w-4 h-4" /> Type
                    </p>
                    <p className="text-white font-bold capitalize">{order.type}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-white/60 flex items-center justify-end gap-1">
                      <Calendar className="w-4 h-4" />
                    </p>
                    <p className="text-white font-medium text-xs">
                      {new Date(order.date).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <p className="text-3xl font-black text-emerald-400">
                    ₦{order.amount.toLocaleString()}
                  </p>
                  <ArrowRight className="w-6 h-6 text-white/40" />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

export default AdminOrders;