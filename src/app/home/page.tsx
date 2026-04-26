// src/app/home/page.tsx
import { cookies } from 'next/headers';
import HomePageClient from "./HomePageClient";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export default async function HomePage() {
  const cookieStore = await cookies();
  const campus = cookieStore.get('studex_campus')?.value || 'pau';

  let initialVendors: any[] = [];
  let initialListings: any[] = [];

  try {
    const res = await fetch(`${API_URL}/api/auth/vendors/?campus=${campus}`, {
      next: { revalidate: 60 },
      headers: { "Content-Type": "application/json" },
    });
    if (res.ok) {
      const data = await res.json();
      initialVendors = data.results || data || [];
    }
  } catch {}

  try {
    const res = await fetch(`${API_URL}/api/services/listings/?campus=${campus}`, {
      next: { revalidate: 60 },
      headers: { "Content-Type": "application/json" },
    });
    if (res.ok) {
      const data = await res.json();
      initialListings = data.results || data || [];
    }
  } catch {}

  return <HomePageClient initialVendors={initialVendors} initialListings={initialListings} />;
}
