import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Become a Vendor",
  robots: { index: true, follow: true },
  description:
    "Start selling your services and products to thousands of students on StudEx. Set up your vendor profile, list your services, and get paid securely through escrow.",
  openGraph: {
    title: "Become a Vendor on StudEx",
    description:
      "Start selling your services and products to thousands of students on StudEx campus marketplace.",
  },
  twitter: {
    title: "Become a Vendor on StudEx",
    description:
      "Start selling your services and products to thousands of students on StudEx campus marketplace.",
  },
};

export default function VendorApplyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
