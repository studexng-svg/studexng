"use client";

import { useState } from "react";
import Link from "next/link";
import TopNav from "@/components/layout/TopNav";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const BADGE_LABELS: Record<string, string> = { top: "Top Vendor", trusted: "Trusted", rising: "Rising" };
const BADGE_STYLES: Record<string, string> = {
  top: "bg-amber-50 text-amber-700 border border-amber-200",
  trusted: "bg-teal-50 text-teal-700 border border-teal-200",
  rising: "bg-purple-50 text-purple-700 border border-purple-200",
};

const RING: Record<number, string> = {
  1: "linear-gradient(135deg, #F59E0B 0%, #FDE68A 100%)",
  2: "linear-gradient(135deg, #94A3B8 0%, #CBD5E1 100%)",
  3: "linear-gradient(135deg, #C2410C 0%, #FB923C 100%)",
};
const BADGE_BG: Record<number, string> = { 1: "#F59E0B", 2: "#94A3B8", 3: "#C2410C" };

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

interface Props {
  initialVendors: Vendor[];
  initialCampus: "pau" | "futo";
}

function Avatar({ vendor, size, ring }: { vendor: Vendor; size: number; ring: string }) {
  const src = vendor.profile_picture?.startsWith("http") ? vendor.profile_picture : null;
  const letter = (vendor.business_name || vendor.username || "?")[0].toUpperCase();
  const inner = size - 6;
  return (
    <div className="rounded-full p-[3px]" style={{ background: ring, width: size, height: size, flexShrink: 0 }}>
      <div className="rounded-full overflow-hidden bg-white w-full h-full">
        {src ? (
          <img src={src} alt={vendor.business_name || vendor.username} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center font-black text-white"
            style={{ background: "linear-gradient(135deg,#0D9488,#7C3AED)", fontSize: inner * 0.38 }}
          >
            {letter}
          </div>
        )}
      </div>
    </div>
  );
}

function PodiumCard({ vendor, rank }: { vendor: Vendor; rank: 1 | 2 | 3 }) {
  const isFirst = rank === 1;
  const hasBadge = vendor.vendor_badge && vendor.vendor_badge !== "none";
  const avatarSize = isFirst ? 76 : 60;

  return (
    <Link href={`/vendor/${vendor.username}`} className={`flex-1 ${isFirst ? "" : rank === 2 ? "mt-10" : "mt-14"}`}>
      <div className="bg-white rounded-2xl shadow-md border border-stone-100 flex flex-col items-center px-2 pt-4 pb-4 hover:shadow-lg transition-shadow cursor-pointer h-full">
        {/* Crown for 1st */}
        {isFirst && <span className="text-3xl leading-none mb-2">👑</span>}

        {/* Avatar + rank badge */}
        <div className="relative">
          <Avatar vendor={vendor} size={avatarSize} ring={RING[rank]} />
          <div
            className="absolute -bottom-2 left-1/2 -translate-x-1/2 min-w-[22px] h-[22px] px-1 rounded-full flex items-center justify-center text-[10px] font-black text-white shadow border-2 border-white"
            style={{ background: BADGE_BG[rank] }}
          >
            {rank}
          </div>
        </div>

        {/* Name */}
        <p className={`font-bold text-stone-900 text-center truncate mt-4 w-full px-1 ${isFirst ? "text-sm" : "text-xs"}`}>
          {vendor.business_name || vendor.username}
        </p>

        {/* Score */}
        <div className="flex items-center gap-1 mt-1">
          <span className="text-emerald-500 font-black" style={{ fontSize: 9 }}>▲</span>
          <span className={`font-bold text-stone-700 ${isFirst ? "text-sm" : "text-xs"}`}>
            {(vendor.completed_order_count || 0).toLocaleString()}
          </span>
        </div>

        {hasBadge && (
          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full mt-2 ${BADGE_STYLES[vendor.vendor_badge]}`}>
            {BADGE_LABELS[vendor.vendor_badge]}
          </span>
        )}
      </div>
    </Link>
  );
}

export default function LeaderboardClient({ initialVendors, initialCampus }: Props) {
  const [vendors, setVendors] = useState<Vendor[]>(initialVendors);
  const [campus, setCampus] = useState<"pau" | "futo">(initialCampus);
  const [loading, setLoading] = useState(false);

  const switchCampus = async (c: "pau" | "futo") => {
    if (c === campus) return;
    setCampus(c);
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/vendors/?campus=${c}&page_size=50`);
      if (res.ok) {
        const data = await res.json();
        setVendors(data.results || data || []);
      }
    } catch {} finally {
      setLoading(false);
    }
  };

  const ranked = [...vendors].sort((a, b) => (b.completed_order_count || 0) - (a.completed_order_count || 0));
  const [p1, p2, p3] = ranked;
  const rest = ranked.slice(3);

  return (
    <div
      className="min-h-screen"
      style={{ background: "linear-gradient(160deg,#EDE9FE 0%,#F0FDFA 45%,#F5F5F4 100%)", fontFamily: "'DM Sans',sans-serif" }}
    >
      <TopNav showBack backHref="/home" />

      <div className="max-w-lg mx-auto px-4 pt-6 pb-32">

        {/* Header row */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black text-stone-900 tracking-tight">Leaderboard</h1>
            <p className="text-stone-400 text-xs mt-0.5">Ranked by completed orders</p>
          </div>
          <div className="flex items-center gap-1 bg-white rounded-full p-1 shadow-sm border border-stone-100">
            {(["pau", "futo"] as const).map(c => (
              <button
                key={c}
                onClick={() => switchCampus(c)}
                className={`px-3 py-1 rounded-full text-xs font-bold uppercase transition-all ${campus === c ? "text-white" : "text-stone-400 hover:text-stone-600"}`}
                style={campus === c ? { background: "linear-gradient(135deg,#0D9488,#7C3AED)" } : {}}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

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
            {/* ── PODIUM: 2nd | 1st | 3rd ── */}
            <div
              className="rounded-3xl p-4 mb-6 shadow-sm border border-white/60"
              style={{ background: "linear-gradient(135deg,rgba(124,58,237,0.08) 0%,rgba(13,148,136,0.08) 100%)" }}
            >
              <div className="flex items-end gap-3">
                {p2 && <PodiumCard vendor={p2} rank={2} />}
                {p1 && <PodiumCard vendor={p1} rank={1} />}
                {p3 && <PodiumCard vendor={p3} rank={3} />}
              </div>
            </div>

            {/* ── DIVIDER ── */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-stone-200" />
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-[0.2em]">Top Rankings</span>
              <div className="flex-1 h-px bg-stone-200" />
            </div>

            {/* ── POSITIONS 4+ ── */}
            <div className="space-y-2">
              {rest.map((vendor, i) => {
                const rank = i + 4;
                const hasBadge = vendor.vendor_badge && vendor.vendor_badge !== "none";
                return (
                  <Link key={vendor.id} href={`/vendor/${vendor.username}`}>
                    <div className="bg-white rounded-2xl p-3 flex items-center gap-3 shadow-sm border border-stone-100 hover:shadow-md transition-shadow cursor-pointer">
                      <Avatar
                        vendor={vendor}
                        size={48}
                        ring="linear-gradient(135deg,#0D9488,#7C3AED)"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-stone-900 truncate">
                          {vendor.business_name || vendor.username}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="text-emerald-500 font-black text-[10px]">▲</span>
                          <span className="text-xs font-semibold text-stone-600">
                            {(vendor.completed_order_count || 0).toLocaleString()} orders
                          </span>
                          {hasBadge && (
                            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${BADGE_STYLES[vendor.vendor_badge]}`}>
                              {BADGE_LABELS[vendor.vendor_badge]}
                            </span>
                          )}
                        </div>
                      </div>
                      <div
                        className="flex-shrink-0 px-2.5 py-1.5 rounded-xl text-white text-xs font-black"
                        style={{ background: "linear-gradient(135deg,#0D9488,#7C3AED)" }}
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
