// src/app/account/loyalty/page.tsx
"use client";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Gift, Star, ChevronLeft, Loader } from "lucide-react";
import { useAuth, fetchWithAuth } from "@/lib/authStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const MILESTONE = 10;
const REWARD    = 200;

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

  const completedInCycle = data ? MILESTONE - data.orders_until_next_reward : 0;
  const progress = data ? Math.round((completedInCycle / MILESTONE) * 100) : 0;

  return (
    <div className="min-h-screen bg-[#FAFAF9]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* HEADER */}
      <div className="sticky top-0 bg-white/80 backdrop-blur-md z-40 border-b border-stone-100 shadow-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => router.back()}
            className="p-2.5 bg-white border border-stone-200 rounded-full shadow-sm active:scale-95 transition-all"
          >
            <ChevronLeft className="w-5 h-5 text-stone-600" />
          </button>
          <h1 className="text-base font-bold text-stone-900" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
            Loyalty Rewards
          </h1>
          <div className="w-10" />
        </div>
      </div>

      <div className="pb-24 p-4 space-y-4">
        {loading ? (
          <div className="flex justify-center pt-20">
            <Loader className="w-10 h-10 text-teal-600 animate-spin" />
          </div>
        ) : !data ? (
          <p className="text-center text-stone-500 pt-20">Could not load loyalty data.</p>
        ) : (
          <>
            {/* CREDIT BALANCE */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl p-6 text-white text-center shadow-xl"
              style={{ background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" }}>
              <Gift className="w-12 h-12 mx-auto mb-3 opacity-90" />
              <p className="text-sm font-semibold opacity-80">Available Credits</p>
              <p className="text-5xl font-bold mt-1">₦{data.credit_balance.toLocaleString()}</p>
              <p className="text-sm opacity-80 mt-2">Applied automatically at checkout</p>
            </motion.div>

            {/* PROGRESS TO NEXT REWARD */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className="bg-white rounded-2xl p-5 shadow-sm border border-stone-200">
              <div className="flex justify-between items-center mb-3">
                <p className="font-semibold text-stone-800">Next Reward</p>
                <span className="text-sm font-semibold text-teal-600">
                  ₦{data.next_reward_amount} credit
                </span>
              </div>
              <div className="w-full bg-stone-100 rounded-full h-3 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }} animate={{ width: `${progress}%` }}
                  transition={{ duration: 1, ease: "easeOut" }}
                  className="h-full rounded-full"
                  style={{ background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" }}
                />
              </div>
              <div className="flex justify-between mt-2">
                <p className="text-xs text-stone-500">
                  {completedInCycle} / {MILESTONE} orders
                </p>
                <p className="text-xs font-semibold text-teal-600">
                  {data.orders_until_next_reward} more to go!
                </p>
              </div>
            </motion.div>

            {/* TOTAL ORDERS STAT */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
              className="bg-white rounded-2xl p-5 shadow-sm border border-stone-200">
              <div className="flex items-center gap-3">
                <Star className="w-6 h-6 text-amber-500" />
                <div>
                  <p className="font-semibold text-stone-800">
                    {data.total_completed_orders} Completed Orders
                  </p>
                  <p className="text-sm text-stone-500">Total on-platform orders</p>
                </div>
              </div>
            </motion.div>

            {/* TRANSACTION HISTORY */}
            {data.recent_transactions.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                className="bg-white rounded-2xl p-5 shadow-sm border border-stone-200">
                <p className="font-semibold text-stone-800 mb-4">Recent Activity</p>
                <div className="space-y-3">
                  {data.recent_transactions.map((t, i) => (
                    <div key={i} className="flex justify-between items-center py-2 border-b border-stone-50 last:border-0">
                      <div>
                        <p className="text-sm font-semibold text-stone-700">{t.description}</p>
                        <p className="text-xs text-stone-400">
                          {new Date(t.date).toLocaleDateString("en-NG")}
                        </p>
                      </div>
                      <span className={`font-semibold text-sm ${t.type === "earned" ? "text-emerald-600" : "text-red-500"}`}>
                        {t.type === "earned" ? "+" : "-"}₦{t.amount}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* HOW IT WORKS */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}
              className="bg-teal-50 rounded-2xl p-5 border border-teal-100">
              <p className="font-semibold text-teal-900 mb-3">How it works</p>
              {[
                "Complete an order on StudEx",
                `Every ${MILESTONE} completed orders = ₦${REWARD} credit`,
                "Credits apply automatically at your next checkout",
                "Only on-platform orders count",
              ].map((step, i) => (
                <div key={i} className="flex gap-3 mb-2">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: "linear-gradient(135deg, #0D9488 0%, #7C3AED 100%)" }}>
                    <span className="text-white text-xs font-semibold">{i + 1}</span>
                  </div>
                  <p className="text-sm text-teal-800">{step}</p>
                </div>
              ))}
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}
