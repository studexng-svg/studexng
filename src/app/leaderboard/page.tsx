export const dynamic = 'force-dynamic';

import type { Metadata } from "next";
import { cookies } from 'next/headers';
import LeaderboardClient from './LeaderboardClient';

export const metadata: Metadata = {
  title: { absolute: "Vendor Leaderboard | StudEx" },
  description: "See the top-performing vendors on StudEx ranked by completed orders.",
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export default async function LeaderboardPage() {
  const cookieStore = await cookies();
  const campus = (cookieStore.get('studex_campus')?.value || 'pau') as "pau" | "futo";

  let vendors: any[] = [];
  try {
    const res = await fetch(`${API_URL}/api/auth/vendors/?campus=${campus}&page_size=50`, {
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      vendors = data.results || data || [];
    }
  } catch {}

  return <LeaderboardClient initialVendors={vendors} initialCampus={campus} />;
}
