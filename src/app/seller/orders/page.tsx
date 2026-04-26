// src/app/seller/orders/page.tsx
"use client";

import { Package, Clock, CheckCircle, ChevronLeft, Calendar, MapPin, User, DollarSign } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/authStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

interface Order {
  id: number;
  reference: string;
  buyer: {
    username: string;
  };
  amount: number;
  created_at: string;
  status: "pending_confirmation" | "completed" | "disputed" | "refunded" | "paid" | "seller_completed";
  type: "service" | "food";
  service_details?: {
    service_name: string;
    date: string;
    time: string;
    location: string;
  };
  food_items?: Array<{
    title: string;
    quantity: number;
  }>;
}

export default function SellerOrdersPage() {
  const router = useRouter();
  const { user: authUser } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const accessToken = localStorage.getItem("accessToken");

    if (!accessToken) {
      router.push("/auth");
      return;
    }

    const fetchOrders = async () => {
      if (!accessToken) {
        setError("Please log in to view orders");
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`${API_URL}/api/orders/pending/`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!res.ok) {
          if (res.status === 401) {
            setError("Session expired. Redirecting...");
            setTimeout(() => router.push("/auth"), 2000);
            return;
          }
          if (res.status === 404) {
            setError("Endpoint not found (404). Make sure you updated orders/views.py with the pending action.");
          } else if (res.status === 500) {
            setError("Backend error (500). Check your Django console for errors.");
          } else {
            setError(`API Error ${res.status}: ${res.statusText}`);
          }
          setLoading(false);
          return;
        }

        const data = await res.json();
        setOrders(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load orders. Try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [router]);

  const pendingCount = orders.length;
  const completedToday = 0;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAF9]">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>
          <Clock className="w-10 h-10 text-teal-600" />
        </motion.div>
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
            Pending Orders
          </h1>
          <Link href="/seller/orders/history">
            <button className="px-3 py-1.5 text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-full hover:bg-teal-100 transition-all">
              History
            </button>
          </Link>
        </div>
      </div>

      <div className="px-4 pt-6 pb-32 space-y-5 max-w-2xl mx-auto">
        {/* STATS */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm">
            <p className="text-xs text-stone-500 font-medium">Pending Confirmation</p>
            <p className="text-3xl font-bold text-amber-600 mt-1">{pendingCount}</p>
          </div>
          <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm">
            <p className="text-xs text-stone-500 font-medium">Completed Today</p>
            <p className="text-3xl font-bold text-emerald-600 mt-1">{completedToday}</p>
          </div>
        </div>

        {error && (
          <div className="text-center text-red-600 text-sm font-medium bg-red-50 border border-red-100 p-4 rounded-2xl">
            {error}
          </div>
        )}

        {orders.length === 0 && !error ? (
          <div className="text-center py-20 space-y-3">
            <Package className="w-16 h-16 text-stone-200 mx-auto" />
            <p className="text-stone-600 font-semibold">No Pending Orders</p>
            <p className="text-stone-400 text-sm">You're all caught up! New orders will appear here.</p>
            <Link href="/seller">
              <button
                className="mt-3 px-8 py-3 text-white font-semibold rounded-full shadow-md text-sm"
                style={{ background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" }}
              >
                Back to Dashboard
              </button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((order, index) => (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Link href={`/seller/orders/${order.id}`}>
                  <div className="bg-white border border-stone-200 rounded-2xl shadow-sm hover:border-teal-300 hover:shadow-md transition-all overflow-hidden">
                    {/* Card header */}
                    <div className="bg-amber-50 border-b border-amber-100 px-4 py-3 flex justify-between items-start">
                      <div>
                        <p className="font-semibold text-stone-900 text-sm">#{order.reference}</p>
                        <p className="text-xs text-stone-400 mt-0.5">
                          {new Date(order.created_at).toLocaleDateString("en-GB")}
                        </p>
                      </div>
                      <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-700 font-medium text-xs flex items-center gap-1.5">
                        <Clock className="w-3 h-3" />
                        Pending
                      </span>
                    </div>

                    <div className="p-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-teal-50 rounded-full flex items-center justify-center flex-shrink-0">
                          <User className="w-4 h-4 text-teal-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-stone-900 text-sm">{order.buyer.username}</p>
                          <p className="text-xs text-stone-400">Buyer</p>
                        </div>
                      </div>

                      {order.type === "service" && order.service_details && (
                        <div className="bg-stone-50 rounded-xl p-3 space-y-1.5 border border-stone-100">
                          <p className="font-semibold text-stone-800 text-sm">{order.service_details.service_name}</p>
                          <div className="flex items-center gap-2 text-xs text-stone-500">
                            <Calendar className="w-3 h-3" />
                            {order.service_details.date} at {order.service_details.time}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-stone-500">
                            <MapPin className="w-3 h-3" />
                            {order.service_details.location}
                          </div>
                        </div>
                      )}

                      {order.type === "food" && order.food_items && (
                        <div className="bg-stone-50 rounded-xl p-3 border border-stone-100">
                          <p className="font-semibold text-stone-800 text-sm mb-1.5">Food Order:</p>
                          <div className="space-y-0.5">
                            {order.food_items.slice(0, 2).map((item, i) => (
                              <p key={i} className="text-xs text-stone-600">
                                {item.title} ×{item.quantity}
                              </p>
                            ))}
                            {order.food_items.length > 2 && (
                              <p className="text-xs text-stone-500">+{order.food_items.length - 2} more items</p>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="flex justify-between items-center pt-2 border-t border-stone-100">
                        <span className="text-xs text-stone-500 flex items-center gap-1.5">
                          <DollarSign className="w-3.5 h-3.5" />
                          Order Amount
                        </span>
                        <span className="text-lg font-bold text-teal-600">
                          ₦{order.amount.toLocaleString()}
                        </span>
                      </div>
                    </div>

                    <div className="bg-teal-50 border-t border-teal-100 px-4 py-2.5">
                      <p className="text-xs font-medium text-teal-700 flex items-center gap-1.5">
                        <CheckCircle className="w-3.5 h-3.5" />
                        Tap to mark as complete
                      </p>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
