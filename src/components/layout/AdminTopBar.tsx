"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, Home } from "lucide-react";

interface Props {
  title?: string;
  back?: string;
}

export default function AdminTopBar({ title = "Admin Panel", back }: Props) {
  const router = useRouter();
  return (
    <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-stone-100 shadow-sm"
      style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={() => back ? router.push(back) : router.back()}
          className="p-2.5 bg-white border border-stone-200 hover:border-stone-300 rounded-full shadow-sm transition-all active:scale-95 flex-shrink-0"
        >
          <ChevronLeft className="w-5 h-5 text-stone-600" />
        </button>
        <h1 className="font-bold text-stone-900 text-base truncate flex-1">{title}</h1>
        <button
          onClick={() => router.push("/home")}
          className="p-2.5 bg-white border border-stone-200 hover:border-teal-300 rounded-full shadow-sm transition-all active:scale-95 flex-shrink-0"
          title="Go to Home"
        >
          <Home className="w-5 h-5 text-stone-600" />
        </button>
      </div>
    </div>
  );
}
