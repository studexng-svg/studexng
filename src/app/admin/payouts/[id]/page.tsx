"use client";
import AdminTopBar from "@/components/layout/AdminTopBar";
import { DollarSign } from "lucide-react";

export default function AdminPayoutDetail() {
  return (
    <div className="min-h-screen bg-[#FFF8F0]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <AdminTopBar title="Payout Detail" back="/admin/payouts" />
      <div className="flex flex-col items-center justify-center py-32 px-6 text-center">
        <DollarSign className="w-10 h-10 text-teal-400 mb-3" />
        <p className="text-stone-500 text-sm">Payout detail not available yet.</p>
      </div>
    </div>
  );
}
