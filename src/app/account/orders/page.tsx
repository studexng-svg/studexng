// src/app/account/orders/page.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Package, CheckCircle, Clock, AlertCircle, ChevronLeft } from "lucide-react";
import { useEffect } from "react";
import { useAuth } from "@/lib/authStore";
import { GRAD, SERIF } from "@/lib/tokens";
import TopNav from "@/components/layout/TopNav";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

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
  useScrollRestoration("account-orders", ["/account/orders/"]);
  const router = useRouter();
  const { isLoggedIn, isHydrated } = useAuth();

  const { data, isPending, isError, error } = useQuery<Order[], Error>({
    queryKey: ["orders-buyer"],
    queryFn: async () => {
      const res = await api.orders.list("buyer");
      if (res.status === 401) throw new Error("unauthorized");
      if (!res.ok) throw new Error(`Failed to load orders: ${res.status}`);
      const data = await res.json();
      return Array.isArray(data) ? data : data.results || [];
    },
    enabled: isHydrated && isLoggedIn,
    refetchInterval: 15_000,
    staleTime: 10_000,
    retry: (_, err) => err.message !== "unauthorized",
  });

  const orders = data ?? [];

  useEffect(() => {
    if (isHydrated && !isLoggedIn) router.push("/auth");
  }, [isHydrated, isLoggedIn, router]);

  useEffect(() => {
    if (error?.message === "unauthorized") {
      setTimeout(() => router.push("/auth"), 2000);
    }
  }, [error, router]);

  const errorMsg = error?.message === "unauthorized"
    ? "Session expired. Please log in again."
    : isError ? "Failed to load orders. Please try again." : "";

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

  if (!isHydrated || isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F5F5]">
        <div className="animate-spin">
          <Clock className="w-12 h-12 text-teal-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <TopNav showBack />

      <div className="px-4 pt-6 pb-32 space-y-4 max-w-4xl mx-auto">
        {errorMsg && (
          <div className="text-center text-red-600 font-medium bg-red-50 p-4 rounded-xl border border-red-200 animate-fadeIn">
            {errorMsg}
          </div>
        )}

        {orders.length === 0 && !errorMsg ? (
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
          orders.map((order) => (
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
