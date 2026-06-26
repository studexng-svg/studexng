import type { Metadata } from "next";
import AdminGuard from "./AdminGuard";
import AdminSidebar from "@/components/layout/AdminSidebar";

export const metadata: Metadata = {
  title: "Admin Dashboard",
  description: "StudEx admin panel.",
  robots: { index: false, follow: false, googleBot: { index: false, follow: false, noarchive: true } },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminGuard>
      <div className="flex h-screen overflow-hidden bg-[#F5F5F5]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <AdminSidebar />
        <main className="flex-1 overflow-y-auto min-w-0">
          {children}
        </main>
      </div>
    </AdminGuard>
  );
}
