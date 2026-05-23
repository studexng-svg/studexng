// src/app/seller/orders/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { User, Clock, AlertCircle } from "lucide-react";
import TopNav from "@/components/layout/TopNav";
import Link from "next/link";
import { useAuth, fetchWithAuth } from "@/lib/authStore";
import { GRAD, SERIF } from "@/lib/tokens";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const STATUS_BADGE: Record<string, string> = {
  paid:             "bg-amber-100 text-amber-700",
  seller_completed: "bg-blue-100 text-blue-700",
  completed:        "bg-emerald-100 text-emerald-700",
  disputed:         "bg-red-100 text-red-700",
  cancelled:        "bg-stone-100 text-stone-500",
};

interface Order {
  id: number;
  reference: string;
  buyer: string;
  amount: number;
  created_at: string;
  status: string;
  current_status: string;
  listing: { id: number; title: string; price: number };
}

export default function SellerOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { isLoggedIn, isHydrated } = useAuth();

  const rawId = params?.id;
  const orderId = (Array.isArray(rawId) ? rawId[0] : rawId) ?? "";

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (isHydrated && !isLoggedIn) { router.push("/auth"); return; }
    if (!isHydrated || !isLoggedIn || !orderId) return;

    const loadOrder = async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const orderRes = await fetchWithAuth(`${API_URL}/api/orders/orders/${orderId}/`);
        if (orderRes.status === 401 || orderRes.status === 403) { router.push("/auth"); return; }
        if (!orderRes.ok) {
          if (!silent) {
            const statusText = orderRes.status === 404 ? "Order not found" : `Failed to load order (${orderRes.status})`;
            console.error("Seller order fetch failed:", orderRes.status, orderId);
            setError(statusText);
          }
          return;
        }
        setOrder(await orderRes.json());
      } catch (err) {
        if (!silent) {
          console.error("Order load error:", err);
          setError("Network error. Please try again.");
        }
      } finally {
        if (!silent) setLoading(false);
      }
    };

    loadOrder();
    const interval = setInterval(() => loadOrder(true), 15000);
    return () => clearInterval(interval);
  }, [isHydrated, isLoggedIn, orderId, router, retryCount]);

  if (!isHydrated || loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAF9F6]">
      <div className="animate-spin"><Clock className="w-10 h-10 text-teal-600" /></div>
    </div>
  );

  if (error || !order) return (
    <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center p-6" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="text-center bg-white border border-stone-200 rounded-2xl p-8 shadow-sm max-w-sm w-full">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h2 className="text-lg font-bold text-stone-800 mb-2" style={SERIF}>
          {error?.includes("not found") ? "Order Not Found" : "Couldn't Load Order"}
        </h2>
        <p className="text-sm text-stone-500 mb-6">{error || "This order could not be loaded."}</p>
        <div className="flex flex-col gap-3">
          {error?.includes("Network") && (
            <button
              onClick={() => { setError(""); setRetryCount(c => c + 1); }}
              className="w-full px-8 py-3 text-white font-semibold rounded-full shadow-md text-sm"
              style={{ background: GRAD }}
            >
              Retry
            </button>
          )}
          <Link href="/seller/orders">
            <button className="w-full px-8 py-3 bg-stone-100 text-stone-700 font-semibold rounded-full text-sm">
              Back to Orders
            </button>
          </Link>
        </div>
      </div>
    </div>
  );

  const badgeClass = STATUS_BADGE[order.status] || "bg-stone-100 text-stone-500";
  const statusLabel: Record<string, string> = {
    paid: "In Progress",
    seller_completed: "Awaiting Buyer Confirmation",
    completed: "Completed",
    disputed: "Disputed",
    cancelled: "Cancelled",
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <TopNav showBack backHref="/seller/orders" />

      <div className="px-4 pt-6 pb-20 space-y-4 max-w-2xl mx-auto">

        {/* ORDER HEADER */}
        <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm flex justify-between items-start animate-fadeUp">
          <div>
            <p className="text-xs text-stone-400 font-medium">Order Reference</p>
            <p className="text-xl font-bold text-stone-900 mt-0.5">#{order.reference}</p>
            <p className="text-xs text-stone-400 mt-1">{new Date(order.created_at).toLocaleString("en-NG")}</p>
          </div>
          <span className={`px-3 py-1.5 rounded-full font-semibold text-xs ${badgeClass}`}>
            {statusLabel[order.status] || order.status}
          </span>
        </div>

        {/* ORDER INFO */}
        <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm animate-fadeUp">
          <h3 className="font-semibold text-stone-800 mb-3 flex items-center gap-2 text-sm">
            <User className="w-4 h-4 text-teal-600" /> Customer & Order
          </h3>
          <div className="space-y-2">
            <div className="flex justify-between py-2 border-b border-stone-50">
              <span className="text-sm text-stone-400">Buyer</span>
              <span className="font-semibold text-stone-800 text-sm">{order.buyer}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-stone-50">
              <span className="text-sm text-stone-400">Item</span>
              <span className="font-semibold text-stone-800 text-sm">{order.listing?.title}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-stone-50">
              <span className="text-sm text-stone-400">Order Total</span>
              <span className="text-sm text-stone-500">
                ₦{Number(order.amount).toLocaleString("en-NG")}
              </span>
            </div>
            <div className="flex justify-between pt-2">
              <span className="font-semibold text-stone-700">Your Payout</span>
              <span className="font-bold text-2xl text-teal-700">
                ₦{Number(order.listing?.price ?? order.amount).toLocaleString("en-NG")}
              </span>
            </div>
          </div>

          {order.status === "seller_completed" && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mt-3">
              Waiting for buyer to confirm receipt and release your payment.
            </p>
          )}
          {order.status === "completed" && (
            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 mt-3">
              ✓ Completed — payment has been released to your account.
            </p>
          )}
          {order.status === "disputed" && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mt-3">
              This order is under dispute. Contact StudEx support for resolution.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
