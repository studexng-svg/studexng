// src/app/home/page.tsx
export const dynamic = 'force-dynamic';

import type { Metadata } from "next";
import { cookies } from 'next/headers';
import HomePageClient from "./HomePageClient";

export const metadata: Metadata = {
  title: { absolute: "StudEx - Campus Marketplace Feed" },
  description:
    "Discover services and products from verified student vendors near you. Browse lashes, nails, laundry, food delivery and more on StudEx.",
  alternates: {
    canonical: "https://studex.com.ng/home",
  },
  openGraph: {
    title: "StudEx - Campus Marketplace Feed",
    description:
      "Discover services and products from verified student vendors near you on StudEx.",
  },
  twitter: {
    title: "StudEx - Campus Marketplace Feed",
    description:
      "Discover services and products from verified student vendors near you on StudEx.",
  },
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export default async function HomePage() {
  const cookieStore = await cookies();
  const campus = cookieStore.get('studex_campus')?.value || 'pau';

  let initialVendors: any[] = [];
  let initialListings: any[] = [];
  let initialCategories: any[] = [];
  let vendorOfMonth: any = null;
  let initialDeals: any[] = [];

  const opts = { next: { revalidate: 60 }, headers: { "Content-Type": "application/json" } };

  try {
    const [vRes, lRes, cRes, mRes, dRes] = await Promise.all([
      fetch(`${API_URL}/api/auth/vendors/?campus=${campus}&page_size=100`, opts),
      fetch(`${API_URL}/api/services/listings/?campus=${campus}&page_size=100`, opts),
      fetch(`${API_URL}/api/services/categories/?campus=${campus}`, opts),
      fetch(`${API_URL}/api/services/vendor-of-month/?campus=${campus}`, opts),
      fetch(`${API_URL}/api/services/deals/?campus=${campus}`, opts),
    ]);
    if (vRes.ok) { const d = await vRes.json(); initialVendors = d.results || d || []; }
    if (lRes.ok) { const d = await lRes.json(); initialListings = d.results || d || []; }
    if (cRes.ok) { const d = await cRes.json(); initialCategories = d.results || d || []; }
    if (mRes.ok) {
      const votm = await mRes.json();
      vendorOfMonth = votm?.username ? votm : null;
    }
    if (dRes.ok) { const d = await dRes.json(); initialDeals = Array.isArray(d) ? d : []; }
  } catch {}

  return (
    <HomePageClient
      initialVendors={initialVendors}
      initialListings={initialListings}
      initialCategories={initialCategories}
      vendorOfMonth={vendorOfMonth}
      initialDeals={initialDeals}
    />
  );
}
