"use client";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import AdminTopBar from "@/components/layout/AdminTopBar";

export default function AdminDisputeDetail() {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-[#FFF8F0]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <AdminTopBar title="Dispute Detail" back="/admin/disputes" />
      <div className="flex flex-col items-center justify-center py-32 px-6 text-center">
        <AlertTriangle className="w-10 h-10 text-amber-400 mb-3" />
        <p className="text-stone-500 text-sm">Dispute detail not available yet.</p>
      </div>
    </div>
  );
}
