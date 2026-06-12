import type { Metadata } from "next";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export async function generateMetadata({
  params,
}: {
  params: { username: string };
}): Promise<Metadata> {
  const { username } = params;
  try {
    const res = await fetch(`${API_URL}/api/auth/vendors/${username}/`, {
      next: { revalidate: 60 },
    });
    if (res.ok) {
      const vendor = await res.json();
      const name = vendor.business_name || vendor.username || username;
      const school = vendor.school ? ` at ${vendor.school.toUpperCase()}` : "";
      const image: string | undefined = vendor.profile_picture || undefined;
      return {
        title: `${name} - Vendor`,
        description: `Book services from ${name}${school} on StudEx, the campus marketplace. View listings, ratings, and more.`,
        openGraph: {
          title: `${name} | StudEx Vendor`,
          description: `Book services from ${name}${school} on StudEx campus marketplace.`,
          images: image ? [{ url: image, width: 400, height: 400, alt: name }] : undefined,
        },
        twitter: {
          card: "summary",
          title: `${name} | StudEx Vendor`,
          description: `Book services from ${name}${school} on StudEx campus marketplace.`,
          images: image ? [image] : undefined,
        },
      };
    }
  } catch {}
  return {
    title: "Vendor Profile",
    description:
      "View this vendor's profile and book services on StudEx, the campus marketplace.",
  };
}

export default function VendorLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
