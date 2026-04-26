// src/app/listing/[id]/page.tsx
export const revalidate = 60;

import ListingDetailClient from "./ListingDetailClient";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export default async function ListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let initialListing = null;
  let initialReviews: any[] = [];

  try {
    const res = await fetch(`${API_URL}/api/services/listings/${id}/`, {
      next: { revalidate: 60 },
      headers: { "Content-Type": "application/json" },
    });
    if (res.ok) {
      initialListing = await res.json();
    }
  } catch {}

  if (initialListing) {
    try {
      const rv = await fetch(`${API_URL}/api/reviews/reviews/?listing=${id}`, {
        next: { revalidate: 60 },
        headers: { "Content-Type": "application/json" },
      });
      if (rv.ok) {
        const rd = await rv.json();
        initialReviews = Array.isArray(rd) ? rd : (rd.results || []);
      }
    } catch {}
  }

  return <ListingDetailClient id={id} initialListing={initialListing} initialReviews={initialReviews} />;
}
