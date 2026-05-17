// src/app/seller/orders/page.tsx
"use client";

import { Package, Clock, ChevronRight, ChevronLeft, User } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, fetchWithAuth } from "@/lib/authStore";
import { GRAD, SERIF } from "@/lib/tokens";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

interface Order {
  id: number;
  reference: string;
  buyer: string;
  amount: number;
  created_at: string;
  status: string;
  current_status: string;
  listing: { title: string; price: number };
}

export default function SellerOrdersPage() {
  const router = useRouter();
  const { user: authUser } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authUser) {
      router.push("/auth");
      return;
    }

    const fetchOrders = async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const res = await fetchWithAuth(`${API_URL}/api/orders/orders/vendor-orders/`);
        if (!res.ok) {
          if (!silent) {
            if (res.status === 401) {
              setError("Session expired. Redirecting...");
              setTimeout(() => router.push("/auth"), 2000);
            } else if (res.status === 404) {
              setError("Endpoint not found (404). Make sure you updated orders/views.py with the pending action.");
            } else if (res.status === 500) {
              setError("Backend error (500). Check your Django console for errors.");
            } else {
              setError(`API Error ${res.status}: ${res.statusText}`);
            }
          }
          return;
        }
        const data = await res.json();
        setOrders(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!silent) setError(err instanceof Error ? err.message : "Failed to load orders. Try again.");
      } finally {
        if (!silent) setLoading(false);
      }
    };

    fetchOrders();
    const interval = setInterval(() => fetchOrders(true), 8000);
    return () => clearInterval(interval);
  }, [router, authUser]);

  const pendingCount = orders.length;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAF9]">
        <div className="animate-spin">
          <Clock className="w-10 h-10 text-teal-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF9]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* HEADER */}
      <div className="sticky top-0 bg-white/80 backdrop-blur-md z-40 border-b border-stone-100 shadow-sm">
        <div className="flex items-center justify-between px-4 py-3 max-w-2xl mx-auto">
          <button onClick={() => router.back()} className="p-2.5 bg-white border border-stone-200 rounded-full shadow-sm active:scale-95 transition-all">
            <ChevronLeft className="w-5 h-5 text-stone-600" />
          </button>
          <h1 className="text-base font-bold text-stone-900" style={SERIF}>
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
        <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm">
          <p className="text-xs text-stone-500 font-medium">Pending Confirmation</p>
          <p className="text-3xl font-bold text-amber-600 mt-1">{pendingCount}</p>
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
                style={{ background: GRAD }}
              >
                Back to Dashboard
              </button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((order, index) => (
              <div key={order.id} className="animate-fadeUp">
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
                          <p className="font-semibold text-stone-900 text-sm">{order.buyer}</p>
                          <p className="text-xs text-stone-400">Buyer</p>
                        </div>
                      </div>

                      {order.listing?.title && (
                        <p className="text-sm text-stone-600 bg-stone-50 rounded-xl px-3 py-2 border border-stone-100">
                          {order.listing.title}
                        </p>
                      )}

                      <div className="pt-2 border-t border-stone-100 space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-stone-400">Order Total</span>
                          <span className="text-sm text-stone-500">
                            ₦{Number(order.amount).toLocaleString("en-NG")}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-semibold text-stone-500">Your Payout</span>
                          <span className="text-lg font-bold text-teal-600">
                            ₦{Number(order.listing?.price ?? order.amount).toLocaleString("en-NG")}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-teal-50 border-t border-teal-100 px-4 py-2.5 flex items-center justify-between">
                      <p className="text-xs font-medium text-teal-700">Tap to update order status</p>
                      <ChevronRight className="w-3.5 h-3.5 text-teal-500" />
                    </div>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
