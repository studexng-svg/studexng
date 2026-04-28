// src/app/seller/orders/history/page.tsx
"use client";

import { ChevronLeft, TrendingUp, DollarSign, Calendar, User, Package, Download } from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth, fetchWithAuth } from "@/lib/authStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

interface Order {
  id: number;
  reference: string;
  buyer: {
    username: string;
  };
  listing: {
    title: string;
    vendor: {
      username: string;
    };
  };
  amount: number;
  created_at: string;
  completed_at?: string;
  status: "completed";
}

export default function SellerOrderHistoryPage() {
  const router = useRouter();
  const { user: authUser } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "week" | "month">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [totalRevenue, setTotalRevenue] = useState(0);

  useEffect(() => {
    if (!authUser) {
      router.push("/auth");
      return;
    }

    const fetchOrders = async () => {
      try {
        const res = await fetchWithAuth(`${API_URL}/api/orders/`);

        if (!res.ok) {
          if (res.status === 401) {
            setError("Session expired. Redirecting...");
            setTimeout(() => router.push("/auth"), 2000);
            return;
          }
          throw new Error(`Failed to load orders: ${res.status}`);
        }

        const data = await res.json();
        const allOrders = Array.isArray(data) ? data : data.results || [];
        const completedOrders = allOrders.filter((o: Order) => o.status === "completed");
        setOrders(completedOrders);

        const revenue = completedOrders.reduce((sum: number, o: Order) => sum + parseFloat(String(o.amount)), 0);
        setTotalRevenue(revenue);

        applyFilters(completedOrders, dateFilter, searchQuery);
      } catch (err) {
        setError("Failed to load order history. Try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [router, authUser]);

  const applyFilters = (orderList: Order[], date: string, search: string) => {
    let filtered = [...orderList];
    const now = new Date();
    if (date === "today") {
      filtered = filtered.filter((o) => new Date(o.created_at).toDateString() === now.toDateString());
    } else if (date === "week") {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      filtered = filtered.filter((o) => new Date(o.created_at) >= weekAgo);
    } else if (date === "month") {
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      filtered = filtered.filter((o) => new Date(o.created_at) >= monthAgo);
    }
    if (search) {
      filtered = filtered.filter((o) =>
        o.buyer.username.toLowerCase().includes(search.toLowerCase()) ||
        o.reference.toLowerCase().includes(search.toLowerCase()) ||
        o.listing.title.toLowerCase().includes(search.toLowerCase())
      );
    }
    setFilteredOrders(filtered);
  };

  const handleDateFilterChange = (date: "all" | "today" | "week" | "month") => {
    setDateFilter(date);
    applyFilters(orders, date, searchQuery);
  };

  const handleSearchChange = (search: string) => {
    setSearchQuery(search);
    applyFilters(orders, dateFilter, search);
  };

  const handleDownloadCSV = () => {
    const csv = [
      ["Order ID", "Buyer", "Service/Product", "Amount", "Date"],
      ...filteredOrders.map((o) => [
        o.reference,
        o.buyer.username,
        o.listing.title,
        `₦${parseFloat(String(o.amount)).toLocaleString()}`,
        new Date(o.created_at).toLocaleDateString("en-GB"),
      ]),
    ]
      .map((row) => row.join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `order-history-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAF9]">
        <div className="animate-spin">
          <Package className="w-10 h-10 text-teal-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF9]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* HEADER */}
      <div className="sticky top-0 bg-white/80 backdrop-blur-md z-40 border-b border-stone-100 shadow-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={() => router.back()} className="p-2.5 bg-white border border-stone-200 rounded-full shadow-sm active:scale-95 transition-all">
            <ChevronLeft className="w-5 h-5 text-stone-600" />
          </button>
          <h1 className="text-base font-bold text-stone-900" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
            Order History
          </h1>
          <div className="w-10" />
        </div>
      </div>

      <div className="px-4 pt-6 pb-32 space-y-5 max-w-2xl mx-auto">
        {/* REVENUE SUMMARY */}
        <div
          className="rounded-2xl p-5 text-white shadow-md"
          style={{ background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              <span className="font-semibold text-sm opacity-90">Total Revenue (All Time)</span>
            </div>
            <button
              onClick={handleDownloadCSV}
              className="bg-white/20 hover:bg-white/30 p-2 rounded-full transition"
              title="Download as CSV"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
          <p className="text-3xl font-bold">₦{totalRevenue.toLocaleString()}</p>
          <p className="text-sm opacity-75 mt-1">
            From {orders.length} completed order{orders.length !== 1 ? "s" : ""}
          </p>
        </div>

        {/* FILTERS */}
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Search by buyer name, order ID, or service..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full px-4 py-3 bg-white border border-stone-200 rounded-xl text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition placeholder:text-stone-400"
          />
          <div className="flex gap-2 overflow-x-auto pb-1">
            {(["all", "today", "week", "month"] as const).map((period) => (
              <button
                key={period}
                onClick={() => handleDateFilterChange(period)}
                className={`px-4 py-2 rounded-full font-medium text-sm whitespace-nowrap transition-all ${
                  dateFilter === period
                    ? "text-white shadow-md"
                    : "bg-white border border-stone-200 text-stone-600 hover:border-stone-300"
                }`}
                style={dateFilter === period ? { background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" } : {}}
              >
                {period === "all" && "All Time"}
                {period === "today" && "Today"}
                {period === "week" && "This Week"}
                {period === "month" && "This Month"}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="text-center text-red-600 text-sm font-medium bg-red-50 border border-red-100 p-4 rounded-2xl">
            {error}
          </div>
        )}

        {/* ORDERS LIST */}
        {filteredOrders.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <Package className="w-16 h-16 text-stone-200 mx-auto" />
            <p className="text-stone-600 font-semibold">No completed orders yet</p>
            <p className="text-stone-400 text-sm">Your completed orders will appear here</p>
            <Link href="/seller/orders">
              <button
                className="mt-3 px-8 py-3 text-white font-semibold rounded-full shadow-md text-sm"
                style={{ background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" }}
              >
                View Pending Orders
              </button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredOrders.map((order, index) => (
              <div key={order.id} className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm hover:border-teal-300 hover:shadow-md transition-all animate-fadeUp">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-semibold text-stone-900 text-sm">#{order.reference}</p>
                    <p className="text-xs text-stone-400 flex items-center gap-1 mt-0.5">
                      <Calendar className="w-3 h-3" />
                      {new Date(order.created_at).toLocaleDateString("en-GB")}
                    </p>
                    <p className="text-sm font-medium text-stone-800 mt-2">{order.listing.title}</p>
                    <p className="text-xs text-stone-500 flex items-center gap-1 mt-0.5">
                      <User className="w-3 h-3" />
                      {order.buyer.username}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0 ml-4">
                    <p className="text-xl font-bold text-emerald-600">
                      ₦{parseFloat(String(order.amount)).toLocaleString()}
                    </p>
                    <span className="mt-1.5 px-2.5 py-0.5 bg-emerald-50 rounded-full text-xs font-medium text-emerald-700 inline-block">
                      ✓ Completed
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {filteredOrders.length > 0 && (
          <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
            <p className="text-sm text-stone-700">
              <span className="font-semibold">Total for this period:</span>{" "}
              <span className="text-teal-600 font-bold">
                ₦{filteredOrders.reduce((sum, o) => sum + parseFloat(String(o.amount)), 0).toLocaleString()}
              </span>{" "}
              ({filteredOrders.length} order{filteredOrders.length !== 1 ? "s" : ""})
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
