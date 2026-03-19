// src/app/account/loyalty/page.tsx
"use client";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Gift, Star, ChevronLeft, Loader } from "lucide-react";
import { useAuth, fetchWithAuth } from "@/lib/authStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

interface LoyaltyData {
  credit_balance: number;
  total_completed_orders: number;
  orders_until_next_reward: number;
  next_reward_amount: number;
  recent_transactions: { type: string; amount: number; description: string; date: string }[];
}

export default function LoyaltyPage() {
  const { isLoggedIn, isHydrated } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<LoyaltyData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isHydrated && !isLoggedIn) { router.push("/auth"); return; }
    if (!isHydrated || !isLoggedIn) return;
    fetchWithAuth(`${API_URL}/api/loyalty/status/`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d); })
      .finally(() => setLoading(false));
  }, [isHydrated, isLoggedIn]);

  const progress = data
    ? Math.round(((5 - data.orders_until_next_reward) / 5) * 100)
    : 0;

  return (
    <>
      <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 z-40 flex items-center justify-between p-4">
        <button onClick={() => router.back()}>
          <ChevronLeft className="w-6 h-6 text-gray-700 dark:text-gray-300" />
        </button>
        <h1 className="text-xl font-black text-gray-900 dark:text-white">Loyalty Rewards</h1>
        <div className="w-6" />
      </div>

      <div className="min-h-screen bg-[#FFF8F0] dark:bg-gray-950 pb-24 p-4 space-y-4">
        {loading ? (
          <div className="flex justify-center pt-20">
            <Loader className="w-10 h-10 text-purple-500 animate-spin" />
          </div>
        ) : !data ? (
          <p className="text-center text-gray-500 pt-20">Could not load loyalty data.</p>
        ) : (
          <>
            {/* CREDIT BALANCE */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className="bg-gradient-to-r from-purple-600 to-teal-500 rounded-3xl p-6 text-white text-center shadow-xl">
              <Gift className="w-12 h-12 mx-auto mb-3 opacity-90" />
              <p className="text-sm font-bold opacity-80">Available Credits</p>
              <p className="text-5xl font-black mt-1">₦{data.credit_balance.toLocaleString()}</p>
              <p className="text-sm opacity-80 mt-2">Applied automatically at checkout</p>
            </motion.div>

            {/* PROGRESS TO NEXT REWARD */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800">
              <div className="flex justify-between items-center mb-3">
                <p className="font-black text-gray-800 dark:text-gray-200">Next Reward</p>
                <span className="text-sm font-bold text-purple-600 dark:text-purple-400">
                  ₦{data.next_reward_amount} credit
                </span>
              </div>
              <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-3 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }} animate={{ width: `${progress}%` }}
                  transition={{ duration: 1, ease: "easeOut" }}
                  className="h-full bg-gradient-to-r from-purple-600 to-teal-500 rounded-full"
                />
              </div>
              <div className="flex justify-between mt-2">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {5 - data.orders_until_next_reward} / 5 orders
                </p>
                <p className="text-xs font-bold text-purple-600 dark:text-purple-400">
                  {data.orders_until_next_reward} more to go!
                </p>
              </div>
            </motion.div>

            {/* TOTAL ORDERS STAT */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
              className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-3">
                <Star className="w-6 h-6 text-amber-500" />
                <div>
                  <p className="font-black text-gray-800 dark:text-gray-200">
                    {data.total_completed_orders} Completed Orders
                  </p>
                  <p className="text-sm text-gray-500">Total on-platform orders</p>
                </div>
              </div>
            </motion.div>

            {/* TRANSACTION HISTORY */}
            {data.recent_transactions.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800">
                <p className="font-black text-gray-800 dark:text-gray-200 mb-4">Recent Activity</p>
                <div className="space-y-3">
                  {data.recent_transactions.map((t, i) => (
                    <div key={i} className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-gray-800 last:border-0">
                      <div>
                        <p className="text-sm font-bold text-gray-700 dark:text-gray-300">{t.description}</p>
                        <p className="text-xs text-gray-400">
                          {new Date(t.date).toLocaleDateString("en-NG")}
                        </p>
                      </div>
                      <span className={`font-black text-sm ${t.type === "earned" ? "text-green-600" : "text-red-500"}`}>
                        {t.type === "earned" ? "+" : "-"}₦{t.amount}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* HOW IT WORKS */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}
              className="bg-purple-50 dark:bg-purple-900/20 rounded-2xl p-5 border border-purple-100 dark:border-purple-800">
              <p className="font-black text-purple-900 dark:text-purple-300 mb-3">How it works</p>
              {[
                "Complete an order on StudEx",
                "Every 5 completed orders = ₦100 credit",
                "Credits apply automatically at your next checkout",
                "Only on-platform orders count",
              ].map((step, i) => (
                <div key={i} className="flex gap-3 mb-2">
                  <div className="w-5 h-5 bg-purple-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-white text-xs font-black">{i + 1}</span>
                  </div>
                  <p className="text-sm text-purple-800 dark:text-purple-300">{step}</p>
                </div>
              ))}
            </motion.div>
          </>
        )}
      </div>
    </>
  );
}
