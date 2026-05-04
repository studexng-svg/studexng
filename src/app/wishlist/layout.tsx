import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Wishlist",
  description: "View and manage your saved items on StudEx.",
  robots: { index: false, follow: false },
};

export default function WishlistLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
