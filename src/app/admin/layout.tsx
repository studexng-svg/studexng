import type { Metadata } from "next";
import AdminGuard from "./AdminGuard";

export const metadata: Metadata = {
  title: "Admin Dashboard",
  description: "StudEx admin panel.",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
      noarchive: true,
    },
  },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminGuard>{children}</AdminGuard>;
}
