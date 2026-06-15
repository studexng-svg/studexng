"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import TopNav from "@/components/layout/TopNav";
import VendorAvatar from "@/components/VendorAvatar";
import { BADGE_STYLES, BADGE_LABELS } from "@/lib/vendor-badges";

import { api } from "@/lib/api";

const RING: Record<number, string> = {
  1: "linear-gradient(135deg, #F59E0B 0%, #FDE68A 100%)",
  2: "linear-gradient(135deg, #94A3B8 0%, #CBD5E1 100%)",
  3: "linear-gradient(135deg, #C2410C 0%, #FB923C 100%)",
};
const BADGE_BG: Record<number, string> = { 1: "#F59E0B", 2: "#94A3B8", 3: "#C2410C" };
const LIST_RING = "linear-gradient(135deg,#0D9488,#7C3AED)";

function ordinal(n: number) {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

interface Vendor {
  id: number;
  username: string;
  business_name: string;
  profile_picture: string | null;
  vendor_badge: "top" | "trusted" | "rising" | "none";
  rating: number;
  total_reviews: number;
  completion_rate: number;
  completed_order_count?: number;
}

interface Votm {
  username: string;
  business_name: string;
  month: string;
}

interface Props {
  initialVendors: Vendor[];
  initialCampus: "pau" | "futo" | "imsu";
  currentVotm?: Votm | null;
}

function PodiumCard({ vendor, rank, isVotm }: { vendor: Vendor; rank: 1 | 2 | 3; isVotm: boolean }) {
  const isFirst = rank === 1;
  const avatarSize = isFirst ? 76 : 60;
  const hasBadge = vendor.vendor_badge && vendor.vendor_badge !== "none";

  return (
    <Link href={`/vendor/${vendor.username}`} className={`flex-1 min-w-0 overflow-hidden ${isFirst ? "" : rank === 2 ? "mt-8" : "mt-20"}`}>
      <div className="bg-white rounded-2xl shadow-md border border-stone-100 flex flex-col items-center px-2 pt-4 pb-4 hover:shadow-lg transition-shadow cursor-pointer h-full">
        {isFirst && <span className="text-3xl leading-none mb-2">👑</span>}

        <div className="relative">
          <VendorAvatar
            name={vendor.business_name || vendor.username}
            picture={vendor.profile_picture}
            size={avatarSize}
            shape="circle"
            ring={RING[rank]}
          />
          <div
            className="absolute -bottom-2 left-1/2 -translate-x-1/2 min-w-[22px] h-[22px] px-1 rounded-full flex items-center justify-center text-xs font-black text-white shadow border-2 border-white"
            style={{ background: BADGE_BG[rank] }}
          >
            {rank}
          </div>
          {isVotm && (
            <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-amber-400 flex items-center justify-center text-xs shadow border-2 border-white">
              🏆
            </div>
          )}
        </div>

        <p className={`font-bold text-stone-900 text-center truncate mt-4 w-full px-1 ${isFirst ? "text-sm" : "text-xs"}`}>
          {vendor.business_name || vendor.username}
        </p>

        <div className="flex items-center gap-1 mt-1">
          <span className="text-emerald-500 font-black" style={{ fontSize: 9 }}>▲</span>
          <span className={`font-bold text-stone-700 ${isFirst ? "text-sm" : "text-xs"}`}>
            {(vendor.completed_order_count || 0).toLocaleString()}
          </span>
        </div>

        {hasBadge && (
          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full mt-2 ${BADGE_STYLES[vendor.vendor_badge]}`}>
            {BADGE_LABELS[vendor.vendor_badge]}
          </span>
        )}
      </div>
    </Link>
  );
}

export default function LeaderboardClient({ initialVendors, initialCampus, currentVotm }: Props) {
  const [vendors, setVendors] = useState<Vendor[]>(initialVendors);
  const [loading, setLoading] = useState(initialVendors.length === 0);

  useEffect(() => {
    setLoading(true);
    api.pub.vendors({ campus: initialCampus, page_size: "50" })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setVendors(d.results || d || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [initialCampus]);

  const ranked = [...vendors].sort((a, b) => (b.completed_order_count || 0) - (a.completed_order_count || 0));
  const [p1, p2, p3] = ranked;
  const rest = ranked.slice(3);
  const votmUsername = currentVotm?.username;

  return (
    <div
      className="min-h-screen"
      style={{ background: "linear-gradient(160deg,#EDE9FE 0%,#F0FDFA 45%,#F5F5F4 100%)", fontFamily: "'DM Sans',sans-serif" }}
    >
      <TopNav showBack backHref="/home" />

      <div className="max-w-lg mx-auto px-4 pt-6 pb-32">

        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-black text-stone-900 tracking-tight">Leaderboard</h1>
            <p className="text-stone-400 text-xs mt-0.5">
              Top vendors at <span className="font-bold text-stone-600 uppercase">{initialCampus}</span> · ranked by completed orders
            </p>
          </div>
          <Link href="/vendor-of-month" className="text-xs font-bold text-teal-600 hover:underline whitespace-nowrap mt-1">
            🏆 Hall of Fame
          </Link>
        </div>

        {/* VOTM banner — shown when we know who the current winner is */}
        {currentVotm && (
          <div className="mb-5 rounded-2xl px-4 py-3 flex items-center gap-3 bg-amber-50 border border-amber-200">
            <span className="text-xl">🏆</span>
            <div className="min-w-0">
              <p className="text-xs font-bold text-amber-800">Vendor of the Month · {currentVotm.month}</p>
              <p className="text-sm font-black text-amber-900 truncate">{currentVotm.business_name}</p>
            </div>
            <Link href={`/vendor/${currentVotm.username}`} className="ml-auto flex-shrink-0 text-xs font-bold text-amber-700 hover:underline">
              Shop →
            </Link>
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} className="bg-white rounded-2xl h-16 animate-pulse border border-stone-100" />
            ))}
          </div>
        ) : ranked.length === 0 ? (
          <div className="bg-white rounded-2xl p-16 text-center border border-stone-100 shadow-sm">
            <p className="text-lg font-bold text-stone-400">No vendors yet</p>
            <p className="text-stone-400 text-sm mt-1">Check back soon!</p>
          </div>
        ) : (
          <>
            {/* ── PODIUM ── */}
            <div
              className="rounded-3xl p-4 mb-6 shadow-sm border border-white/60"
              style={{ background: "linear-gradient(135deg,rgba(124,58,237,0.08) 0%,rgba(13,148,136,0.08) 100%)" }}
            >
              <div className="flex items-end gap-3">
                {p2 && <PodiumCard vendor={p2} rank={2} isVotm={p2.username === votmUsername} />}
                {p1 && <PodiumCard vendor={p1} rank={1} isVotm={p1.username === votmUsername} />}
                {p3 && <PodiumCard vendor={p3} rank={3} isVotm={p3.username === votmUsername} />}
              </div>
            </div>

            {/* ── DIVIDER ── */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-stone-200" />
              <span className="text-xs font-bold text-stone-400 uppercase tracking-[0.2em]">Top Rankings</span>
              <div className="flex-1 h-px bg-stone-200" />
            </div>

            {/* ── POSITIONS 4+ ── */}
            <div className="space-y-2">
              {rest.map((vendor, i) => {
                const rank = i + 4;
                const hasBadge = vendor.vendor_badge && vendor.vendor_badge !== "none";
                const isVotm = vendor.username === votmUsername;
                return (
                  <Link key={vendor.id} href={`/vendor/${vendor.username}`}>
                    <div className={`bg-white rounded-2xl p-3 flex items-center gap-3 shadow-sm border transition-shadow cursor-pointer hover:shadow-md ${isVotm ? "border-amber-200 bg-amber-50/40" : "border-stone-100"}`}>
                      <VendorAvatar
                        name={vendor.business_name || vendor.username}
                        picture={vendor.profile_picture}
                        size={48}
                        shape="circle"
                        ring={LIST_RING}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-bold text-sm text-stone-900 truncate">
                            {vendor.business_name || vendor.username}
                          </p>
                          {isVotm && <span className="text-sm leading-none">🏆</span>}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="text-emerald-500 font-black text-xs">▲</span>
                          <span className="text-xs font-semibold text-stone-600">
                            {(vendor.completed_order_count || 0).toLocaleString()} orders
                          </span>
                          {hasBadge && (
                            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${BADGE_STYLES[vendor.vendor_badge]}`}>
                              {BADGE_LABELS[vendor.vendor_badge]}
                            </span>
                          )}
                        </div>
                      </div>
                      <div
                        className="flex-shrink-0 px-2.5 py-1.5 rounded-xl text-white text-xs font-black"
                        style={{ background: LIST_RING }}
                      >
                        {ordinal(rank)}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
