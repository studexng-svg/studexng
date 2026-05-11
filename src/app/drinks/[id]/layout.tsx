import type { Metadata } from "next";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const { id } = params;
  try {
    const res = await fetch(`${API_URL}/api/auth/vendors/${id}/`, {
      next: { revalidate: 60 },
    });
    if (res.ok) {
      const data = await res.json();
      const name = data.business_name || data.username || "a student vendor";
      return {
        title: `${name} — Drinks`,
        description: `Order drinks from ${name} on StudEx campus marketplace. Fast delivery for PAU students.`,
        openGraph: {
          title: `${name} | Drinks on StudEx`,
          description: `Order drinks from ${name} on StudEx campus marketplace.`,
          images: data.profile_image ? [{ url: data.profile_image, alt: name }] : undefined,
        },
      };
    }
  } catch {}
  return {
    title: "Drinks Vendor",
    description: "Order drinks from student vendors on StudEx campus marketplace.",
  };
}

export default function DrinksLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
