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
  const campus = (cookieStore.get('studex_campus')?.value || 'pau') as "pau" | "futo" | "imsu";

  let vendors: any[] = [];
  let currentVotm: any = null;

  await Promise.all([
    fetch(`${API_URL}/api/auth/vendors/?campus=${campus}&page_size=50`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) vendors = d.results || d || []; })
      .catch(() => {}),
    fetch(`${API_URL}/api/services/vendor-of-month/`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) currentVotm = d; })
      .catch(() => {}),
  ]);

  return <LeaderboardClient initialVendors={vendors} initialCampus={campus} currentVotm={currentVotm} />;
}
