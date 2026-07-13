"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Users, Calendar, ShoppingBag, Sparkles } from "lucide-react";
import { TEAL, toArray } from "@/lib/tokens";
import { EmptyState, LoadingSpinner, HEADING_FONT } from "../_shared";
import { api } from "@/lib/api";

interface VendorCustomer {
  id: number;
  customer: number;
  customer_username: string;
  customer_name: string;
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
}

type Sort = "last_purchase" | "total_spent";

export default function VendorCustomersPage() {
  const router = useRouter();
  const [sort, setSort] = useState<Sort>("last_purchase");

  const { data, isPending } = useQuery<VendorCustomer[]>({
    queryKey: ["vendor-customers", sort],
    queryFn: async () => {
      const res = await api.customers.list(sort);
      if (!res.ok) throw new Error("Failed to load customers");
      return toArray(await res.json());
    },
    staleTime: 30_000,
  });

  const customers = data ?? [];

  if (isPending) return <LoadingSpinner />;

  return (
    <div className="pb-4">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-bold mb-0.5">Relationships</p>
          <h2 className="font-black text-stone-900 text-xl tracking-tight" style={HEADING_FONT}>Customers</h2>
          <p className="text-stone-400 text-xs mt-0.5">{customers.length} customer{customers.length !== 1 ? "s" : ""}</p>
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="text-xs font-semibold border border-stone-200 rounded-full px-3 py-2 bg-white text-stone-600"
        >
          <option value="last_purchase">Most Recent</option>
          <option value="total_spent">Highest Spend</option>
        </select>
      </div>

      {customers.length === 0 ? (
        <EmptyState icon={Users} message="No customers yet" />
      ) : (
        <div className="space-y-3">
          {customers.map((c) => (
            <button
              key={c.id}
              onClick={() => router.push(`/vendor/dashboard/customers/${c.customer}`)}
              className="w-full text-left bg-white border border-stone-200 rounded-2xl p-4 shadow-sm hover:border-teal-300 transition"
            >
              <div className="flex items-center gap-3">
                {c.customer_profile_picture ? (
                  <img src={c.customer_profile_picture} alt={c.customer_name}
                    className="w-11 h-11 rounded-full object-cover flex-shrink-0 ring-2 ring-white shadow-sm" />
                ) : (
                  <div className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-base flex-shrink-0 shadow-sm"
                    style={{ background: TEAL }}>
                    {c.customer_name?.[0]?.toUpperCase() || "?"}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-stone-900 text-sm truncate">{c.customer_name}</p>
                  <p className="text-xs text-stone-400">@{c.customer_username}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-bold text-teal-600 text-sm">₦{Number(c.total_amount_spent).toLocaleString()}</p>
                  <p className="text-xs text-stone-400">{c.total_completed_orders} order{c.total_completed_orders !== 1 ? "s" : ""}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3">
                <div className="bg-stone-50 rounded-xl p-2 text-center">
                  <Calendar className="w-3.5 h-3.5 mx-auto mb-1 text-stone-400" />
                  <p className="text-[10px] text-stone-400">Last Purchase</p>
                  <p className="text-xs font-semibold text-stone-700">{new Date(c.last_purchase_at).toLocaleDateString()}</p>
                </div>
                <div className="bg-stone-50 rounded-xl p-2 text-center">
                  <ShoppingBag className="w-3.5 h-3.5 mx-auto mb-1 text-stone-400" />
                  <p className="text-[10px] text-stone-400">Avg. Order</p>
                  <p className="text-xs font-semibold text-stone-700">₦{Number(c.average_order_value).toLocaleString()}</p>
                </div>
                <div className="bg-stone-50 rounded-xl p-2 text-center">
                  <Sparkles className="w-3.5 h-3.5 mx-auto mb-1 text-stone-400" />
                  <p className="text-[10px] text-stone-400">Favorite</p>
                  <p className="text-xs font-semibold text-stone-700 truncate">{c.favorite_listing_title || "—"}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
