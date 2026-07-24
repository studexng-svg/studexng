"use client";
import { Loader, ToggleRight, ToggleLeft } from "lucide-react";

// Shared between the Listings tab (where dishes/listings are created and
// approval status is authoritative) and the Kitchen tab (where add-ons are
// managed for the same underlying listing) — keeps the two tabs visually
// interconnected instead of each inventing its own status pill.
export function AvailabilityBadge({ isAvailable }: { isAvailable: boolean }) {
  return (
    <span className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg ${
      isAvailable ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-600"
    }`}>
      {isAvailable ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
      {isAvailable ? "Active" : "Pending Approval"}
    </span>
  );
}

export function ListingThumb({ src, alt, fallbackIcon: Icon }: { src?: string | null; alt: string; fallbackIcon: any }) {
  return (
    <div className="w-12 h-12 rounded-xl overflow-hidden bg-stone-50 flex-shrink-0 flex items-center justify-center">
      {src ? <img src={src} alt={alt} className="w-full h-full object-cover" /> : <Icon className="w-5 h-5 text-stone-300" />}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending:   "bg-amber-100 text-amber-700",
    confirmed: "bg-teal-50 text-teal-700",
    completed: "bg-emerald-50 text-emerald-700",
    cancelled: "bg-red-50 text-red-600",
    paid:      "bg-blue-50 text-blue-700",
    seller_completed: "bg-purple-50 text-purple-700",
    disputed:  "bg-red-50 text-red-600",
    vendor_declined: "bg-stone-100 text-stone-500",
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
