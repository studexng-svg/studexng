// src/app/category/[slug]/page.tsx
export const revalidate = 60;

import CategoryPageClient from "./CategoryPageClient";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

interface Listing {
  id: number;
  title: string;
  description: string;
  price: number;
  image: string;
  vendor: {
    id: number;
    username: string;
    business_name?: string;
    profile?: {
      vendor_badge: "none" | "rising" | "trusted" | "top";
      completion_rate: number;
      rating: number;
      total_reviews: number;
    };
  };
  category: { id: number; title: string };
  is_available: boolean;
  listing_type?: string;
}

export default async function CategoryPage({ params }: { params: { slug: string } }) {
  const { slug } = params;
  let initialListings: Listing[] = [];
  try {
    const res = await fetch(`${API_URL}/api/services/listings/?category=${slug}`, {
      next: { revalidate: 60 },
      headers: { "Content-Type": "application/json" },
    });
    if (res.ok) {
      const data = await res.json();
      initialListings = data.results || [];
    }
  } catch {}
  return <CategoryPageClient slug={slug} initialListings={initialListings} />;
}
