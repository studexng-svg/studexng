// src/app/category/[slug]/page.tsx
export const dynamic = 'force-dynamic';

import type { Metadata } from "next";
import { cookies } from 'next/headers';
import CategoryPageClient from "./CategoryPageClient";

function slugToTitle(slug: string) {
  return slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const name = slugToTitle(params.slug);
  return {
    title: `${name} Services`,
    description: `Browse ${name.toLowerCase()} services from verified student vendors on StudEx, the campus marketplace at Pan-Atlantic University.`,
    openGraph: {
      title: `${name} Services | StudEx`,
      description: `Browse ${name.toLowerCase()} services from verified student vendors on StudEx.`,
    },
    twitter: {
      title: `${name} Services | StudEx`,
      description: `Browse ${name.toLowerCase()} services from verified student vendors on StudEx.`,
    },
  };
}

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
  const cookieStore = await cookies();
  const campus = cookieStore.get('studex_campus')?.value || 'pau';
  let initialListings: Listing[] = [];
  try {
    const res = await fetch(`${API_URL}/api/services/listings/?category=${slug}&campus=${campus}`, {
      cache: 'no-store',
      headers: { "Content-Type": "application/json" },
    });
    if (res.ok) {
      const data = await res.json();
      initialListings = data.results || [];
    }
  } catch {}
  return <CategoryPageClient slug={slug} initialListings={initialListings} />;
}
