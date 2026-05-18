"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, Shield } from "lucide-react";
import { GRAD } from "@/lib/tokens";

interface Props {
  title?: string;
  back?: string;
}

export default function AdminTopBar({ title = "Admin Panel", back }: Props) {
  const router = useRouter();
  return (
    <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-stone-100 shadow-sm"
      style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="flex items-center gap-3 px-4 py-3 max-w-2xl mx-auto">
        <button
          onClick={() => window.history.length > 1 ? router.back() : back ? router.push(back) : router.back()}
          className="p-2.5 bg-white border border-stone-200 hover:border-stone-300 rounded-full shadow-sm transition-all active:scale-95 flex-shrink-0"
        >
          <ChevronLeft className="w-5 h-5 text-stone-600" />
        </button>
        <div className="flex items-center gap-2 flex-1">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: GRAD }}>
            <Shield className="w-3.5 h-3.5 text-white" />
          </div>
          <h1 className="font-bold text-stone-900 text-base truncate">{title}</h1>
        </div>
      </div>
    </div>
  );
}
