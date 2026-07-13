"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Calendar, ShoppingBag, TrendingUp, Sparkles } from "lucide-react";
import { TEAL } from "@/lib/tokens";
import { StatusBadge, EmptyState, LoadingSpinner, HEADING_FONT } from "../../_shared";
import { api } from "@/lib/api";

interface OrderHistoryItem {
  id: number;
  reference: string;
  listing_title: string;
  amount: string;
  status: string;
  created_at: string;
}

interface VendorCustomerDetail {
  customer_name: string;
  customer_username: string;
  customer_profile_picture: string | null;
  first_purchase_at: string;
  last_purchase_at: string;
  total_completed_orders: number;
  total_amount_spent: string;
  average_order_value: string;
  total_successful_bookings: number;
  customer_lifetime_value: string;
  favorite_listing_title: string | null;
  favorite_category_title: string | null;
  order_history: OrderHistoryItem[];
}

export default function VendorCustomerDetailPage() {
  const router = useRouter();
  const { customerId } = useParams<{ customerId: string }>();

  const { data, isPending, isError } = useQuery<VendorCustomerDetail>({
    queryKey: ["vendor-customer", customerId],
    queryFn: async () => {
      const res = await api.customers.detail(customerId);
      if (!res.ok) throw new Error("Failed to load customer");
      return res.json();
    },
    staleTime: 30_000,
  });

  if (isPending) return <LoadingSpinner />;
  if (isError || !data) return <EmptyState icon={ShoppingBag} message="Customer not found" />;

  const stats = [
    { icon: ShoppingBag, label: "Completed Orders", value: data.total_completed_orders },
    { icon: TrendingUp, label: "Total Spent", value: `₦${Number(data.total_amount_spent).toLocaleString()}` },
    { icon: Calendar, label: "Avg. Order Value", value: `₦${Number(data.average_order_value).toLocaleString()}` },
    { icon: Sparkles, label: "Successful Bookings", value: data.total_successful_bookings },
  ];

  return (
    <div className="pb-4">
      <button onClick={() => router.push("/vendor/dashboard/customers")}
        className="flex items-center gap-1.5 text-stone-400 hover:text-stone-600 text-sm font-semibold mb-4">
        <ChevronLeft className="w-4 h-4" /> Back to Customers
      </button>

      <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm mb-4">
        <div className="flex items-center gap-3">
          {data.customer_profile_picture ? (
            <img src={data.customer_profile_picture} alt={data.customer_name}
              className="w-14 h-14 rounded-full object-cover flex-shrink-0 ring-2 ring-white shadow-sm" />
          ) : (
            <div className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-xl flex-shrink-0 shadow-sm"
              style={{ background: TEAL }}>
              {data.customer_name?.[0]?.toUpperCase() || "?"}
            </div>
          )}
          <div>
            <h2 className="font-black text-stone-900 text-lg" style={HEADING_FONT}>{data.customer_name}</h2>
            <p className="text-sm text-stone-400">@{data.customer_username}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          {stats.map(({ icon: Icon, label, value }) => (
            <div key={label} className="bg-stone-50 rounded-xl p-3 text-center">
              <Icon className="w-4 h-4 mx-auto mb-1 text-teal-500" />
              <p className="text-[10px] text-stone-400">{label}</p>
              <p className="text-sm font-bold text-stone-800">{value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
          <div className="bg-stone-50 rounded-xl p-3">
            <p className="text-stone-400">First Purchase</p>
            <p className="font-semibold text-stone-700 mt-0.5">{new Date(data.first_purchase_at).toLocaleDateString()}</p>
          </div>
          <div className="bg-stone-50 rounded-xl p-3">
            <p className="text-stone-400">Last Purchase</p>
            <p className="font-semibold text-stone-700 mt-0.5">{new Date(data.last_purchase_at).toLocaleDateString()}</p>
          </div>
          <div className="bg-stone-50 rounded-xl p-3">
            <p className="text-stone-400">Favorite Service</p>
            <p className="font-semibold text-stone-700 mt-0.5 truncate">{data.favorite_listing_title || "—"}</p>
          </div>
          <div className="bg-stone-50 rounded-xl p-3">
            <p className="text-stone-400">Favorite Category</p>
            <p className="font-semibold text-stone-700 mt-0.5 truncate">{data.favorite_category_title || "—"}</p>
          </div>
        </div>
      </div>

      <h3 className="font-bold text-stone-900 text-sm mb-3">Order History</h3>
      {data.order_history.length === 0 ? (
        <EmptyState icon={ShoppingBag} message="No orders yet" />
      ) : (
        <div className="space-y-2">
          {data.order_history.map((order) => (
            <div key={order.id} className="bg-white border border-stone-200 rounded-xl p-3.5 flex items-center justify-between shadow-sm">
              <div className="min-w-0">
                <p className="font-semibold text-stone-900 text-sm truncate">{order.listing_title}</p>
                <p className="text-xs text-stone-400">#{order.reference} · {new Date(order.created_at).toLocaleDateString()}</p>
              </div>
              <div className="text-right flex-shrink-0 flex items-center gap-2">
                <p className="font-bold text-stone-800 text-sm">₦{Number(order.amount).toLocaleString()}</p>
                <StatusBadge status={order.status} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
