// src/app/account/orders/page.tsx
"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Package, CheckCircle, Clock, ChevronLeft, AlertCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth, fetchWithAuth } from "@/lib/authStore";

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

    const fetchOrders = async () => {
      try {
        const res = await fetchWithAuth(`${API_URL}/api/orders/orders/`);

        if (!res.ok) {
          if (res.status === 401) {
            setError("Session expired. Please log in again.");
            setTimeout(() => router.push("/auth"), 2000);
            return;
          }
          throw new Error(`Failed to load orders: ${res.status}`);
        }

        const data = await res.json();
        const ordersList = Array.isArray(data) ? data : data.results || [];
        setOrders(ordersList);
      } catch (err) {
        console.error("Orders fetch error:", err);
        setError("Failed to load orders. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [isHydrated, isLoggedIn, router]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "paid":
      case "processing": return "bg-amber-100 text-amber-600";
      case "completed": return "bg-emerald-100 text-emerald-600";
      case "disputed": return "bg-red-100 text-red-600";
      case "cancelled": return "bg-gray-100 text-gray-500";
      default: return "bg-gray-100 text-gray-600";
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-teal-50">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}>
          <Clock className="w-12 h-12 text-purple-600" />
        </motion.div>
      </div>
    );
  }

  return (
    <>
      {/* TOP BAR */}
      <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        className="sticky top-0 bg-white/90 backdrop-blur-xl z-40 border-b border-purple-100 shadow-sm">
        <div className="flex items-center justify-between p-4 max-w-4xl mx-auto">
          <Link href="/account">
            <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
              className="p-2 hover:bg-purple-100 rounded-full transition">
              <ChevronLeft className="w-6 h-6 text-purple-600" />
            </motion.button>
          </Link>
          <h1 className="text-xl font-black bg-gradient-to-r from-purple-600 to-teal-500 bg-clip-text text-transparent">
            My Orders
          </h1>
          <div className="w-10" />
        </div>
      </motion.div>

      <div className="p-4 pb-32 space-y-4 max-w-4xl mx-auto">
        {error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="text-center text-red-600 font-medium bg-red-50 p-4 rounded-xl border border-red-200">
            {error}
          </motion.div>
        )}

        {orders.length === 0 && !error ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-20">
            <Package className="w-20 h-20 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">No orders yet</p>
            <p className="text-gray-400 text-sm mt-2">Book a service or order food to get started</p>
            <Link href="/home">
              <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                className="mt-6 px-8 py-3 bg-gradient-to-r from-purple-600 to-teal-500 text-white rounded-full font-black">
                Start Exploring
              </motion.button>
            </Link>
          </motion.div>
        ) : (
          orders.map((order, index) => (
            <motion.div key={order.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="bg-white rounded-2xl shadow-md border border-gray-200 overflow-hidden hover:shadow-lg transition-all">
              <Link href={`/account/orders/${order.id}`}>
                <div className="cursor-pointer">
                  {/* HEADER */}
                  <div className="bg-gradient-to-r from-purple-50 to-teal-50 p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-black text-gray-800 text-sm">#{order.reference}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {new Date(order.created_at).toLocaleDateString("en-NG", {
                            day: "numeric", month: "short", year: "numeric"
                          })}
                        </p>
                      </div>
                      <div className={`px-3 py-1.5 rounded-full font-bold text-xs flex items-center gap-1.5 ${getStatusColor(order.status)}`}>
                        {getStatusIcon(order.status)}
                        <span>{getStatusLabel(order.status)}</span>
                      </div>
                    </div>
                  </div>

                  {/* ORDER INFO */}
                  <div className="p-4">
                    <p className="font-bold text-gray-800">{order.listing?.title || "Order"}</p>
                    <p className="text-sm text-gray-500 mt-0.5">{order.listing?.vendor?.username}</p>
                  </div>

                  {/* AMOUNT */}
                  <div className="bg-gray-50 px-4 py-3 border-t flex items-center justify-between">
                    <p className="font-black text-xl text-purple-600">
                      ₦{parseFloat(String(order.amount)).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                    </p>
                    <ChevronLeft className="w-5 h-5 text-gray-400 rotate-180" />
                  </div>
                </div>
              </Link>
            </motion.div>
          ))
        )}
      </div>
    </>
  );
}
