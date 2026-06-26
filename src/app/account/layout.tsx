import type { Metadata } from "next";
import AccountSidebarWrapper from "./_sidebar";

export const metadata: Metadata = {
  title: "My Account",
  description: "Manage your StudEx account, orders, bookings, and profile settings.",
  robots: { index: false, follow: false },
};

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <AccountSidebarWrapper>{children}</AccountSidebarWrapper>;
}
