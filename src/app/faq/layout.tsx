import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Frequently Asked Questions",
  description:
    "Have questions about StudEx? Find answers about booking services, payments, escrow, refunds, vendor onboarding, and how the campus marketplace works.",
  openGraph: {
    title: "Frequently Asked Questions | StudEx",
    description:
      "Find answers to common questions about booking, payments, vendors, and the StudEx campus marketplace.",
  },
  twitter: {
    title: "Frequently Asked Questions | StudEx",
    description:
      "Find answers to common questions about booking, payments, vendors, and the StudEx campus marketplace.",
  },
};

export default function FaqLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
