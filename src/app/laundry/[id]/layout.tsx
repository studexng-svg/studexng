import type { Metadata } from "next";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const { id } = params;
  try {
    const res = await fetch(`${API_URL}/api/services/listings/${id}/`, {
      next: { revalidate: 60 },
    });
    if (res.ok) {
      const data = await res.json();
      const name = data.vendor?.business_name || data.vendor?.username || "a student vendor";
      return {
        title: `${data.title || "Laundry Services"} by ${name}`,
        description: `Book ${data.title?.toLowerCase() || "laundry services"} from ${name} on StudEx. ${data.description?.slice(0, 100) || ""}`,
        openGraph: {
          title: `${data.title || "Laundry Services"} | StudEx`,
          description: data.description?.slice(0, 155) || "Book laundry services on StudEx campus marketplace.",
          images: data.image ? [{ url: data.image, alt: data.title }] : undefined,
        },
      };
    }
  } catch {}
  return {
    title: "Laundry Services",
    description: "Book reliable laundry services from student vendors on StudEx campus marketplace.",
  };
}

export default function LaundryLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
