import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Vendor Hub",
  description: "Manage your listings, orders, and earnings on StudEx.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
