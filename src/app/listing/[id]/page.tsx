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
      const price = listing.price ? Number(listing.price) : null;
      const discount = listing.discount_percent ? Number(listing.discount_percent) : 0;
      const salePrice = price && discount > 0 ? Math.round(price * (1 - discount / 100)) : null;
      const vendorName = listing.vendor?.business_name || listing.vendor?.username || "a student vendor";
      const rawDesc = listing.description
        ? listing.description.slice(0, 120) + (listing.description.length > 120 ? "…" : "")
        : "";
      const priceStr = salePrice
        ? `₦${salePrice.toLocaleString("en-NG")} (${discount}% off)`
        : price
        ? `₦${price.toLocaleString("en-NG")}`
        : null;
      const ogTitle = salePrice
        ? `${listing.title} — ${discount}% OFF | StudEx`
        : price
        ? `${listing.title} — ₦${price.toLocaleString("en-NG")} | StudEx`
        : `${listing.title} | StudEx`;
      const ogDesc = [
        priceStr ? `${priceStr} · Sold by @${vendorName}` : `Sold by @${vendorName}`,
        rawDesc,
      ].filter(Boolean).join(" · ");

      return {
        title: ogTitle,
        description: ogDesc,
        openGraph: {
          title: ogTitle,
          description: ogDesc,
          images: listing.image
            ? [{ url: listing.image, alt: listing.title, width: 1200, height: 630 }]
            : undefined,
          type: "website",
        },
        twitter: {
          card: "summary_large_image",
          title: ogTitle,
          description: ogDesc,
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
