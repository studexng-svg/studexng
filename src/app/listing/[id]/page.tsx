// src/app/listing/[id]/page.tsx
export const revalidate = 60;

import type { Metadata } from "next";
import ListingDetailClient from "./ListingDetailClient";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/services/listings/${id}/`,
      { next: { revalidate: 60 } }
    );
    if (res.ok) {
      const listing = await res.json();
      const desc = listing.description
        ? listing.description.slice(0, 155) + (listing.description.length > 155 ? "…" : "")
        : "View this listing on StudEx campus marketplace.";
      const vendorName = listing.vendor?.business_name || listing.vendor?.username || "a student vendor";
      return {
        title: listing.title,
        description: `${desc} — offered by ${vendorName} on StudEx.`,
        openGraph: {
          title: `${listing.title} | StudEx`,
          description: desc,
          images: listing.image ? [{ url: listing.image, alt: listing.title }] : undefined,
        },
        twitter: {
          card: "summary_large_image",
          title: `${listing.title} | StudEx`,
          description: desc,
          images: listing.image ? [listing.image] : undefined,
        },
      };
    }
  } catch {}
  return {
    title: "Listing",
    description: "View this listing on StudEx campus marketplace.",
  };
}

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
