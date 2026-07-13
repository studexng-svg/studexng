// src/app/categories/page.tsx
export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { cookies } from "next/headers";
import CategoriesClient from "./CategoriesClient";

export const metadata: Metadata = {
  title: "Browse Categories",
  description:
    "Explore all service categories on StudEx — lashes, nails, laundry, food delivery, photography, and more from verified student vendors at PAU.",
  openGraph: {
    title: "Browse Categories | StudEx",
    description:
      "Explore all service categories on StudEx — lashes, nails, laundry, food and more from student vendors.",
  },
  twitter: {
    title: "Browse Categories | StudEx",
    description:
      "Explore all service categories on StudEx — lashes, nails, laundry, food and more from student vendors.",
  },
};

interface Category {
  id: number;
  title: string;
  slug: string;
  image: string;
}

export default async function CategoriesPage() {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
  const cookieStore = await cookies();
  const campus = cookieStore.get("studex_campus")?.value || "pau";

  let categories: Category[] = [];
  try {
    const res = await fetch(
      `${API_URL}/api/services/categories/?campus=${campus}`,
      { cache: "no-store" }
    );
    if (res.ok) {
      const data = await res.json();
      categories = data.results || data || [];
    }
  } catch {}
  return <CategoriesClient categories={categories} />;
}
