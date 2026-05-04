import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Cart",
  description: "Review your cart and proceed to checkout on StudEx.",
  robots: { index: false, follow: false },
};

export default function CartLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
