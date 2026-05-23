// src/app/admin/rewards/page.tsx
"use client";

import { useEffect, useState } from "react";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { fetchWithAuth } from "@/lib/authStore";
import { GRAD } from "@/lib/tokens";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

interface RewardUser {
  username: string;
  credit_balance: number;
  total_completed_orders: number;
  orders_until_next_reward: number;
  progress_pct: number;
  discount_eligible: boolean;
  discount_used: boolean;
}

interface Summary {
  total_credits_issued: number;
  total_credits_redeemed: number;
  credits_outstanding: number;
  users_with_credit_balance: number;
  discount_users_count: number;
}

export default function AdminRewardsPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [users, setUsers] = useState<RewardUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "credits" | "discount">("all");

  useEffect(() => {
    fetchWithAuth(`${API_URL}/api/admin/rewards-overview/`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) { setSummary(d.summary); setUsers(d.users); }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = users.filter(u => {
    const matchSearch = u.username.toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;
    if (filter === "credits") return u.credit_balance > 0;
    if (filter === "discount") return u.discount_used;
    return true;
  });

  return (
    <div className="min-h-screen bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <AdminTopBar title="Rewards & Discounts" back="/admin" />

      <div className="px-4 pt-5 pb-28 max-w-2xl mx-auto space-y-4">

        <div>
          <p className="text-teal-600 text-xs tracking-[0.2em] uppercase font-semibold">Overview</p>
          <h2 className="text-lg font-bold text-stone-900 mt-0.5">Loyalty & Profile Bonuses</h2>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white border border-stone-200 rounded-2xl p-4 h-20 animate-pulse" />
            ))}
          </div>
        ) : summary && (
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Credits Issued", value: `₦${summary.total_credits_issued.toLocaleString()}`, color: "#10B981" },
              { label: "Credits Redeemed", value: `₦${summary.total_credits_redeemed.toLocaleString()}`, color: "#F59E0B" },
              { label: "Outstanding Balance", value: `₦${summary.credits_outstanding.toLocaleString()}`, color: "#6366F1" },
              { label: "5% Discount Used", value: `${summary.discount_users_count} users`, color: "#EF4444" },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
                <p className="text-2xl font-bold text-stone-900">{value}</p>
                <p className="text-xs text-stone-500 mt-0.5">{label}</p>
                <div className="w-8 h-1 rounded-full mt-2" style={{ background: color }} />
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-2">
          {(["all", "credits", "discount"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-full text-sm font-semibold capitalize transition ${filter === f ? "text-white" : "bg-white text-stone-500 border border-stone-200"}`}
              style={filter === f ? { background: GRAD } : {}}>
              {f === "all" ? "All" : f === "credits" ? "Has Credits" : "Used Discount"}
            </button>
          ))}
        </div>

        <input
          type="text"
          placeholder="Search by username..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-teal-400"
        />

        <div className="space-y-3">
          {filtered.length === 0 && !loading && (
            <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center">
              <p className="text-stone-400 text-sm">No users match this filter.</p>
            </div>
          )}
          {filtered.map(u => (
            <div key={u.username} className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-stone-900 text-sm">@{u.username}</p>
                <div className="flex items-center gap-1.5">
                  {u.credit_balance > 0 && (
                    <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">
                      ₦{u.credit_balance.toLocaleString()} credits
                    </span>
                  )}
                  {u.discount_used && (
                    <span className="bg-teal-100 text-teal-700 text-xs font-bold px-2 py-0.5 rounded-full">
                      5% used
                    </span>
                  )}
                  {!u.discount_used && u.discount_eligible && (
                    <span className="bg-stone-100 text-stone-500 text-xs font-medium px-2 py-0.5 rounded-full">
                      5% available
                    </span>
                  )}
                </div>
              </div>

              {/* Loyalty progress */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-stone-500">
                    {u.total_completed_orders % 10}/10 orders toward next ₦200 reward
                  </p>
                  <p className="text-xs text-stone-400">{u.total_completed_orders} total</p>
                </div>
                <div className="w-full bg-stone-100 rounded-full h-1.5">
                  <div
                    className="h-1.5 rounded-full transition-all"
                    style={{ width: `${u.progress_pct}%`, background: GRAD }}
                  />
                </div>
                <p className="text-xs text-stone-400 mt-0.5">
                  {u.orders_until_next_reward === 10 && u.total_completed_orders === 0
                    ? "No orders yet"
                    : u.orders_until_next_reward === 0
                    ? "Milestone reached!"
                    : `${u.orders_until_next_reward} more order${u.orders_until_next_reward !== 1 ? "s" : ""} to earn ₦200`}
                </p>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
