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

  try {
    const res = await fetch(`${API_URL}/api/auth/vendors/?campus=${campus}&page_size=500`, {
      cache: 'no-store',
      headers: { "Content-Type": "application/json" },
    });
    if (res.ok) {
      const data = await res.json();
      initialVendors = data.results || data || [];
    }
  } catch {}

  try {
    const res = await fetch(`${API_URL}/api/services/listings/?campus=${campus}&page_size=500`, {
      cache: 'no-store',
      headers: { "Content-Type": "application/json" },
    });
    if (res.ok) {
      const data = await res.json();
      initialListings = data.results || data || [];
    }
  } catch {}

  try {
    const res = await fetch(`${API_URL}/api/services/categories/?campus=${campus}`, {
      cache: 'no-store',
      headers: { "Content-Type": "application/json" },
    });
    if (res.ok) {
      const data = await res.json();
      initialCategories = data.results || data || [];
    }
  } catch {}

  try {
    const res = await fetch(`${API_URL}/api/services/vendor-of-month/`, {
      cache: 'no-store',
      headers: { "Content-Type": "application/json" },
    });
    if (res.ok) {
      const data = await res.json();
      vendorOfMonth = data || null;
    }
  } catch {}

  return (
    <HomePageClient
      initialVendors={initialVendors}
      initialListings={initialListings}
      initialCategories={initialCategories}
      vendorOfMonth={vendorOfMonth}
    />
  );
}
