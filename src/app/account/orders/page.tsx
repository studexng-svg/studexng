// src/app/account/orders/page.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Package, CheckCircle, Clock, AlertCircle, ChevronLeft } from "lucide-react";
import { useEffect } from "react";
import { useAuth } from "@/lib/authStore";
import { TEAL } from "@/lib/tokens";
import TopNav from "@/components/layout/TopNav";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
import { api, BASE_URL, fetchAllPages } from "@/lib/api";
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
  status: "pending" | "paid" | "seller_completed" | "completed" | "disputed" | "cancelled" | "vendor_declined";
}

const ACTIVE_STATUSES = new Set(["pending", "paid", "seller_completed", "disputed"]);

function OrderCard({
  order, getStatusColor, getStatusIcon, getStatusLabel,
}: {
  order: Order;
  getStatusColor: (s: string) => string;
  getStatusIcon: (s: string) => React.ReactNode;
  getStatusLabel: (s: string) => string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden hover:border-teal-300 hover:shadow-md transition-all animate-fadeUp">
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
  );
}

export default function OrdersPage() {
  useScrollRestoration("account-orders", ["/account/orders/"]);
  const router = useRouter();
  const { isLoggedIn, isHydrated } = useAuth();

  const { data, isPending, isError, error } = useQuery<Order[], Error>({
    queryKey: ["orders-buyer"],
    queryFn: async () => {
      // The list endpoint is paginated (PAGE_SIZE=20, newest first) — a single
      // fetchWithAuth() call only returns page 1, which can silently hide older
      // completed/cancelled orders once a buyer has more than 20 total. Check
      // auth/error status on the first page, then pull every page.
      const check = await api.orders.list("buyer");
      if (check.status === 401) throw new Error("unauthorized");
      if (!check.ok) throw new Error(`Failed to load orders: ${check.status}`);
      return fetchAllPages(`${BASE_URL}/api/orders/orders/?role=buyer`);
    },
    enabled: isHydrated && isLoggedIn,
    refetchInterval: 15_000,
    staleTime: 10_000,
    retry: (_, err) => err.message !== "unauthorized",
  });

  const orders = data ?? [];
  const activeOrders = orders.filter((o) => ACTIVE_STATUSES.has(o.status));
  const previousOrders = orders.filter((o) => !ACTIVE_STATUSES.has(o.status));

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
      case "paid": return "bg-amber-100 text-amber-600";
      case "seller_completed": return "bg-blue-100 text-blue-600";
      case "completed": return "bg-emerald-100 text-emerald-600";
      case "disputed": return "bg-red-100 text-red-600";
      case "cancelled":
      case "vendor_declined": return "bg-stone-100 text-stone-500";
      default: return "bg-stone-100 text-stone-500";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed": return <CheckCircle className="w-4 h-4" />;
      case "disputed":
      case "cancelled":
      case "vendor_declined": return <AlertCircle className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "pending": return "Pending Payment";
      case "paid": return "In Progress";
      case "seller_completed": return "Awaiting Your Confirmation";
      case "completed": return "Completed";
      case "disputed": return "Disputed";
      case "cancelled": return "Cancelled";
      case "vendor_declined": return "Declined — Refunded";
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
                style={{ background: TEAL }}
              >
                Start Exploring
              </button>
            </Link>
          </div>
        ) : (
          <>
            {activeOrders.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-wide text-stone-400 px-1">
                  Active ({activeOrders.length})
                </p>
                {activeOrders.map((order) => (
                  <OrderCard key={order.id} order={order} getStatusColor={getStatusColor} getStatusIcon={getStatusIcon} getStatusLabel={getStatusLabel} />
                ))}
              </div>
            )}

            {previousOrders.length > 0 && (
              <div className="space-y-3 mt-6">
                <p className="text-xs font-bold uppercase tracking-wide text-stone-400 px-1">
                  Previous ({previousOrders.length})
                </p>
                {previousOrders.map((order) => (
                  <OrderCard key={order.id} order={order} getStatusColor={getStatusColor} getStatusIcon={getStatusIcon} getStatusLabel={getStatusLabel} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
