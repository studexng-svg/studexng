"use client";
import { Loader } from "lucide-react";

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending:   "bg-amber-100 text-amber-700",
    confirmed: "bg-teal-50 text-teal-700",
    completed: "bg-emerald-50 text-emerald-700",
    cancelled: "bg-red-50 text-red-600",
    paid:      "bg-blue-50 text-blue-700",
    seller_completed: "bg-purple-50 text-purple-700",
  };
  return (
    <span className={`${map[status] || "bg-stone-100 text-stone-500"} text-xs px-3 py-1 rounded-full font-medium capitalize`}>
      {status.replace("_", " ")}
    </span>
  );
}

export function EmptyState({ icon: Icon, message }: { icon: any; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="w-16 h-16 rounded-2xl mb-5 flex items-center justify-center"
        style={{ background: "rgba(13,148,136,0.07)", border: "1px solid rgba(13,148,136,0.14)" }}>
        <Icon className="w-7 h-7 text-teal-400 opacity-70" />
      </div>
      <p className="font-black text-stone-300 text-lg tracking-tight text-center"
        style={{ fontFamily: "var(--font-jakarta), 'Plus Jakarta Sans', sans-serif" }}>
        {message}
      </p>
    </div>
  );
}

export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader className="w-7 h-7 text-teal-600 animate-spin" />
    </div>
  );
}

export const HEADING_FONT = { fontFamily: "var(--font-jakarta), 'Plus Jakarta Sans', sans-serif" };
