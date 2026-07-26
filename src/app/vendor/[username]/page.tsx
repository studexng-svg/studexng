// src/app/vendor/[username]/page.tsx
// Server wrapper: decides whether this username belongs on /vendor/ or
// /store/ before rendering anything, then hands off to the one shared
// implementation (VendorProfileClient) — see that file's header comment.
import { permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import VendorProfileClient from "./VendorProfileClient";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

type Params = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { username } = await params;
  return { title: `@${username} — Vendor | StudEx` };
}

export default async function VendorPage({ params }: Params) {
  const { username } = await params;

  // Store vs Vendor is a routing/display distinction only (same underlying
  // Vendor/VendorType data — see accounts/models.py), decided by the same
  // is_menu_vendor field VendorListSerializer already exposes everywhere
  // else. permanentRedirect (308) rather than a temporary one: which route
  // a vendor belongs on is set once (vendor_type assignment) and essentially
  // never flips back, so old shared links (WhatsApp, bookmarks) should have
  // their link equity transferred to the new URL, not just bounced there.
  let isMenuVendor = false;
  try {
    const res = await fetch(`${API_URL}/api/auth/vendors/${encodeURIComponent(username)}/`, {
      next: { revalidate: 60 },
    });
    if (res.ok) {
      const vendor = await res.json();
      isMenuVendor = !!vendor?.is_menu_vendor;
    }
  } catch {
    // Fetch failed — fall through and render the vendor route as-is;
    // VendorProfileClient already handles "vendor not found" gracefully.
  }

  if (isMenuVendor) {
    permanentRedirect(`/store/${encodeURIComponent(username)}`);
  }

  return <VendorProfileClient />;
}
