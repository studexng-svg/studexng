// src/app/categories/page.tsx
export const revalidate = 60;

import CategoriesClient from "./CategoriesClient";

interface Category {
  id: number;
  title: string;
  slug: string;
  image: string;
}

export default async function CategoriesPage() {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
  let categories: Category[] = [];
  try {
    const res = await fetch(`${API_URL}/api/services/categories/`, {
      next: { revalidate: 60 },
      headers: { "Content-Type": "application/json" },
    });
    if (res.ok) {
      const data = await res.json();
      categories = data.results || data || [];
    }
  } catch {}
  return <CategoriesClient categories={categories} />;
}
