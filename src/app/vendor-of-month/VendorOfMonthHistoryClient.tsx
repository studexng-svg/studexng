"use client";

import Link from "next/link";
import TopNav from "@/components/layout/TopNav";
import VendorAvatar from "@/components/VendorAvatar";
import { BADGE_STYLES, BADGE_LABELS } from "@/lib/vendor-badges";

const GRAD = "linear-gradient(135deg,#2DD4BF 0%,#0D9488 55%,#0f766e 100%)";

interface VotmEntry {
  month: string;
  month_key: string;
  username: string;
  business_name: string;
  profile_picture: string | null;
  rating: number;
  total_reviews: number;
  vendor_badge: string;
  total_orders: number;
  completion_rate: number;
  is_manual_override: boolean;
}

export default function VendorOfMonthHistoryClient({ history }: { history: VotmEntry[] }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />

      <div className="max-w-2xl mx-auto px-4 pt-6 pb-20">
        {/* Header */}
        <div className="text-center mb-6">
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-white text-xs font-bold mb-3"
            style={{ background: GRAD }}
          >
            🏆 Hall of Fame
          </div>
          <h1 className="text-2xl font-black text-gray-900">Vendor of the Month</h1>
          <p className="text-sm text-gray-500 mt-1">Every vendor who earned the top spot on StudEx</p>
          <Link
            href="/leaderboard"
            className="inline-block mt-3 text-xs font-bold text-teal-600 hover:underline"
          >
            View Live Leaderboard →
          </Link>
        </div>

        {history.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-4xl mb-3">🏆</p>
            <p className="font-medium">No winners yet</p>
            <p className="text-sm mt-1">Check back after the first month wraps up.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {history.map((entry, i) => (
              <Link
                key={entry.month_key}
                href={`/vendor/${entry.username}`}
                className="relative flex items-center gap-4 bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow active:scale-[0.98]"
              >
                <div className="relative">
                  <VendorAvatar
                    name={entry.business_name || entry.username}
                    picture={entry.profile_picture}
                    size={72}
                    shape="rounded"
                  />
                  {i === 0 && (
                    <div
                      className="absolute -top-2 -right-2 w-6 h-6 rounded-full text-white text-[10px] font-black flex items-center justify-center shadow"
                      style={{ background: GRAD }}
                    >
                      ★
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900 truncate">{entry.business_name}</p>
                      <p className="text-xs text-gray-400 truncate">@{entry.username}</p>
                    </div>
                    <span
                      className="flex-shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full text-white whitespace-nowrap"
                      style={{ background: GRAD }}
                    >
                      {entry.month}
                    </span>
                  </div>

                  <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-gray-500">
                    <span>🛒 {entry.total_orders} orders</span>
                    {entry.rating > 0 && (
                      <span>
                        ⭐ {entry.rating.toFixed(1)}
                        {entry.total_reviews > 0 && (
                          <span className="text-gray-400"> ({entry.total_reviews})</span>
                        )}
                      </span>
                    )}
                    {entry.completion_rate > 0 && (
                      <span>✅ {Math.round(entry.completion_rate)}%</span>
                    )}
                    {entry.vendor_badge && entry.vendor_badge !== "none" && (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${BADGE_STYLES[entry.vendor_badge] || ""}`}>
                        {BADGE_LABELS[entry.vendor_badge] || entry.vendor_badge}
                      </span>
                    )}
                  </div>
                </div>

                <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
