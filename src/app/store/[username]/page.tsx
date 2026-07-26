// src/app/store/[username]/page.tsx
// Mirror of src/app/vendor/[username]/page.tsx — same redirect logic in
// reverse, same shared VendorProfileClient. See that file's comments for
// the full reasoning (permanentRedirect choice, fetch-failure fallback).
import { permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import VendorProfileClient from "../../vendor/[username]/VendorProfileClient";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

type Params = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { username } = await params;
  return { title: `@${username} — Store | StudEx` };
}

export default async function StorePage({ params }: Params) {
  const { username } = await params;

  let isMenuVendor = true; // default to "stay on /store/" if the fetch fails
  try {
    const res = await fetch(`${API_URL}/api/auth/vendors/${encodeURIComponent(username)}/`, {
      next: { revalidate: 60 },
    });
    if (res.ok) {
      const vendor = await res.json();
      isMenuVendor = !!vendor?.is_menu_vendor;
    }
  } catch {
    // Fetch failed — fall through and render the store route as-is;
    // VendorProfileClient already handles "vendor not found" gracefully.
  }

  if (!isMenuVendor) {
    permanentRedirect(`/vendor/${encodeURIComponent(username)}`);
  }

  return <VendorProfileClient />;
}
