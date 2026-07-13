"use client";

import { useQuery } from "@tanstack/react-query";
import { LoadingSpinner, HEADING_FONT } from "../_shared";
import { api } from "@/lib/api";

export default function EarningsPage() {
  const { data: earningsData, isPending: earningsLoading } = useQuery({
    queryKey: ["vendor-earnings"],
    queryFn: async () => {
      const res = await api.payments.earnings();
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 60_000,
  });

  const { data: transactionsData, isPending: txLoading } = useQuery({
    queryKey: ["vendor-transactions"],
    queryFn: async () => {
      const res = await api.payments.transactions();
      if (!res.ok) return [];
      const tx = await res.json();
      return Array.isArray(tx) ? tx : (tx.results || []);
    },
    staleTime: 60_000,
  });

  const data = earningsData;
  const transactions: any[] = transactionsData ?? [];

  if (earningsLoading || txLoading) return <LoadingSpinner />;

  const stats = [
    {
      label: "Total Earned",
      value: `₦${Number(data?.total_earned || 0).toLocaleString()}`,
      color: "text-teal-600",
      bg: "bg-teal-50 border-teal-100",
      note: "Your cumulative payouts",
    },
    {
      label: "Completed Orders",
      value: data?.total_orders ?? 0,
      color: "text-purple-600",
      bg: "bg-purple-50 border-purple-100",
      note: "All time",
    },
  ];

  return (
    <div className="space-y-5 pb-4">
      <div>
        <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-bold mb-0.5">Overview</p>
        <h2 className="font-black text-stone-900 text-xl tracking-tight" style={HEADING_FONT}>Your Earnings</h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {stats.map(stat => (
          <div key={stat.label} className={`bg-white border rounded-2xl p-5 shadow-sm ${stat.bg}`}>
            <p className="text-stone-400 text-xs mb-1.5">{stat.label}</p>
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-stone-400 text-xs mt-1">{stat.note}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm">
        <div className="mb-4">
          <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-bold mb-0.5">Payouts</p>
          <h3 className="font-black text-stone-900 text-base tracking-tight" style={HEADING_FONT}>How You Get Paid</h3>
        </div>
        <div className="space-y-2 text-sm text-stone-500 leading-relaxed">
          {[
            "A customer pays through Paystack checkout.",
            "You receive your full listing price — no fees are ever deducted from your payout.",
            "Your payout goes directly to your bank account — Paystack now pays out in real time, usually within minutes of the order completing.",
          ].map((step, i) => (
            <div key={i} className="flex items-start gap-3 bg-stone-50 border border-stone-100 rounded-xl p-3">
              <span className="text-teal-600 font-bold text-base leading-none">{i + 1}</span>
              <p>{step}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-stone-100">
          <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-bold mb-0.5">History</p>
          <h3 className="font-black text-stone-900 text-base tracking-tight" style={HEADING_FONT}>Transactions</h3>
        </div>
        {transactions.length === 0 ? (
          <div className="p-8 text-center text-stone-400 text-sm">No transactions yet</div>
        ) : (
          <div className="divide-y divide-stone-100">
            {transactions.map((tx: any) => (
              <div key={tx.id} className="px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-stone-800 text-sm">{tx.service_name || `Order #${tx.order_id}`}</p>
                  <p className="text-xs text-stone-400">
                    {tx.buyer_name} · {new Date(tx.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-teal-600 text-sm">₦{Number(tx.seller_amount).toLocaleString()}</p>
                  <p className="text-xs text-stone-400">your payout</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
