// src/app/admin/payouts/page.tsx
"use client";

import { DollarSign } from "lucide-react";
import AdminTopBar from "@/components/layout/AdminTopBar";

export default function AdminPayouts() {
  return (
    <div className="min-h-screen bg-[#FFF8F0]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <AdminTopBar title="Payouts" back="/admin" />
      <div className="flex flex-col items-center justify-center py-32 px-6 text-center">
        <div className="w-14 h-14 bg-teal-100 rounded-2xl flex items-center justify-center mb-4">
          <DollarSign className="w-7 h-7 text-teal-600" />
        </div>
        <p className="font-bold text-stone-900 text-lg mb-1">No payout requests</p>
        <p className="text-stone-400 text-sm">Vendor withdrawal requests will appear here when submitted.</p>
      </div>
    </div>
  );
}
