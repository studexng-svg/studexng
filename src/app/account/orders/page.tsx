// src/app/account/orders/page.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Package, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth, fetchWithAuth } from "@/lib/authStore";
import { GRAD, SERIF } from "@/lib/tokens";
import TopNav from "@/components/layout/TopNav";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

interface Order {
  id: number;
  reference: string;
  listing: {
    title: string;
    vendor: { username: string };
  };
  amount: number;
  created_at: string;
  status: "pending" | "paid" | "processing" | "completed" | "disputed" | "cancelled";
}

export default function OrdersPage() {
  const router = useRouter();
  const { isLoggedIn, isHydrated } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isHydrated && !isLoggedIn) {
      router.push("/auth");
      return;
    }
    if (!isHydrated || !isLoggedIn) return;

    const fetchOrders = async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const res = await fetchWithAuth(`${API_URL}/api/orders/orders/?role=buyer`);
        if (!res.ok) {
          if (res.status === 401) {
            setError("Session expired. Please log in again.");
            setTimeout(() => router.push("/auth"), 2000);
            return;
          }
          if (!silent) throw new Error(`Failed to load orders: ${res.status}`);
          return;
        }
        const data = await res.json();
        const ordersList = Array.isArray(data) ? data : data.results || [];
        setOrders(ordersList);
      } catch (err) {
        if (!silent) {
          console.error("Orders fetch error:", err);
          setError("Failed to load orders. Please try again.");
        }
      } finally {
        if (!silent) setLoading(false);
      }
    };

    fetchOrders();
    const interval = setInterval(() => fetchOrders(true), 15000);
    return () => clearInterval(interval);
  }, [isHydrated, isLoggedIn, router]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "paid":
      case "processing": return "bg-amber-100 text-amber-600";
      case "completed": return "bg-emerald-100 text-emerald-600";
      case "disputed": return "bg-red-100 text-red-600";
      case "cancelled": return "bg-stone-100 text-stone-500";
      default: return "bg-stone-100 text-stone-500";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed": return <CheckCircle className="w-4 h-4" />;
      case "disputed":
      case "cancelled": return <AlertCircle className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "pending": return "Pending Payment";
      case "paid":
      case "processing": return "In Progress";
      case "completed": return "Completed";
      case "disputed": return "Disputed";
      case "cancelled": return "Cancelled";
      default: return status;
    }
  };

  if (!isHydrated || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF9F6]">
        <div className="animate-spin">
          <Clock className="w-12 h-12 text-teal-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <TopNav showBack backHref="/account" />

      <div className="px-4 pt-6 pb-32 space-y-4 max-w-4xl mx-auto">
        {error && (
          <div className="text-center text-red-600 font-medium bg-red-50 p-4 rounded-xl border border-red-200 animate-fadeIn">
            {error}
          </div>
        )}

        {orders.length === 0 && !error ? (
          <div className="text-center py-20 animate-fadeIn">
            <Package className="w-20 h-20 text-stone-300 mx-auto mb-4" />
            <p className="text-stone-500 font-medium">No orders yet</p>
            <p className="text-stone-400 text-sm mt-2">Book a service or order food to get started</p>
            <Link href="/home">
              <button
                className="mt-6 px-8 py-3 text-white rounded-full font-semibold shadow-lg"
                style={{ background: GRAD }}
              >
                Start Exploring
              </button>
            </Link>
          </div>
        ) : (
          orders.map((order, index) => (
            <div key={order.id} className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden hover:border-teal-300 hover:shadow-md transition-all animate-fadeUp">
              <Link href={`/account/orders/${order.id}`}>
                <div className="cursor-pointer">
                  {/* HEADER */}
                  <div className="bg-stone-50 p-4 border-b border-stone-100">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold text-stone-800 text-sm">#{order.reference}</p>
                        <p className="text-xs text-stone-500 mt-0.5">
                          {new Date(order.created_at).toLocaleDateString("en-NG", {
                            day: "numeric", month: "short", year: "numeric"
                          })}
                        </p>
                      </div>
                      <div className={`px-3 py-1.5 rounded-full font-semibold text-xs flex items-center gap-1.5 ${getStatusColor(order.status)}`}>
                        {getStatusIcon(order.status)}
                        <span>{getStatusLabel(order.status)}</span>
                      </div>
                    </div>
                  </div>

                  {/* ORDER INFO */}
                  <div className="p-4">
                    <p className="font-semibold text-stone-800">{order.listing?.title || "Order"}</p>
                    <p className="text-sm text-stone-500 mt-0.5">{order.listing?.vendor?.username}</p>
                  </div>

                  {/* AMOUNT */}
                  <div className="bg-stone-50 px-4 py-3 border-t border-stone-100 flex items-center justify-between">
                    <p className="font-bold text-xl text-teal-700">
                      ₦{parseFloat(String(order.amount)).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                    </p>
                    <ChevronLeft className="w-5 h-5 text-stone-400 rotate-180" />
                  </div>
                </div>
              </Link>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
