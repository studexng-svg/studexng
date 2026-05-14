// src/app/admin/disputes/page.tsx
"use client";

import { AlertTriangle } from "lucide-react";
import AdminTopBar from "@/components/layout/AdminTopBar";

export default function AdminDisputes() {
  return (
    <div className="min-h-screen bg-[#FFF8F0]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <AdminTopBar title="Disputes" back="/admin" />
      <div className="flex flex-col items-center justify-center py-32 px-6 text-center">
        <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center mb-4">
          <AlertTriangle className="w-7 h-7 text-amber-600" />
        </div>
        <p className="font-bold text-stone-900 text-lg mb-1">No disputes yet</p>
        <p className="text-stone-400 text-sm">Open disputes will appear here when raised by buyers or sellers.</p>
      </div>
    </div>
  );
}
